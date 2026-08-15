import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { IdentityUserClient } from '../../common/identity/identity-user.client';
import { StaysAuditService } from '../stays/services/stays-audit.service';
import {
  StaysSupportTicket,
  SupportTicketPriority,
} from './entities/stays-support-ticket.entity';
import { StaysSupportAgentSkills } from './entities/stays-support-agent-skills.entity';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import {
  SUPPORT_ROUTING_ADVISORY_LOCK,
  calculateRoutingScore,
  capacityEligibleAgentIds,
  emptyWorkload,
  isSupportAutoAssignEnabled,
  maxActiveTicketsPerAgent,
  pickSkillTier,
  selectBestAgent,
  type RoutingAgentSkills,
  type RoutingAgentWorkload,
} from './support-routing.config';

@Injectable()
export class SupportAssignmentService {
  private readonly logger = new Logger(SupportAssignmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly identityUsers: IdentityUserClient,
    private readonly staysAudit: StaysAuditService,
    private readonly ops: OperationalIntelligenceService,
  ) {}

  /**
   * Post-commit auto-assign. Never throws to callers: Identity outages,
   * empty roster, capacity, and assign errors leave the ticket unassigned.
   */
  async attemptAutoAssignment(ticketId: string): Promise<void> {
    if (!ticketId || !isSupportAutoAssignEnabled()) return;
    try {
      const assigned = await this.assignLocked(ticketId);
      if (assigned) {
        await this.ops.safeEvaluate(() => this.ops.evaluateTicket(ticketId));
      }
    } catch (err) {
      this.logger.warn(`auto-assign skipped for ${ticketId}: ${err}`);
    }
  }

  private async assignLocked(ticketId: string): Promise<boolean> {
    const roster = await this.identityUsers.listActiveSupportAgents();
    const eligibleIds = roster
      .filter(
        (row) =>
          row.status === 'ACTIVE' && row.staff_role === 'SUPPORT_AGENT' && row.id,
      )
      .map((row) => row.id);
    if (eligibleIds.length === 0) return false;

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        SUPPORT_ROUTING_ADVISORY_LOCK,
      ]);

      const repo = manager.getRepository(StaysSupportTicket);
      const ticket = await repo
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: ticketId })
        .getOne();
      if (!ticket || ticket.assigned_admin_id) return false;

      const workloadRows = await this.ops.queryAssignedAgentWorkload();
      const workloads = new Map<string, RoutingAgentWorkload>();
      for (const id of eligibleIds) {
        workloads.set(id, emptyWorkload(id));
      }
      for (const row of workloadRows) {
        if (!workloads.has(row.agentId)) continue;
        workloads.set(row.agentId, {
          agentId: row.agentId,
          assigned: row.assigned,
          inProgress: row.inProgress,
          waiting: row.waiting,
          atRisk: row.atRisk,
          breached: row.breached,
        });
      }

      const lastAssignedAt = await this.queryLastAssignmentTimes(
        manager,
        eligibleIds,
      );
      const maxActive = maxActiveTicketsPerAgent();
      const priority = ticket.priority as SupportTicketPriority;
      const remaining = capacityEligibleAgentIds({
        agentIds: eligibleIds,
        workloads,
        priority,
        maxActive,
      });
      if (remaining.length === 0) return false;

      const skillRows = await manager.getRepository(StaysSupportAgentSkills).find({
        where: { agent_user_id: In(remaining) },
      });
      const skills = new Map<string, RoutingAgentSkills>();
      for (const row of skillRows) {
        skills.set(row.agent_user_id, {
          languages: row.languages ?? [],
          categories: row.categories ?? [],
        });
      }
      const tier = pickSkillTier({
        agentIds: remaining,
        skills,
        category: ticket.category,
        language: ticket.requester_language ?? null,
      });

      const ineligible = new Set<string>();
      let picked: string | null = null;
      while (!picked) {
        const candidate = selectBestAgent({
          agentIds: tier.agentIds.filter((id) => !ineligible.has(id)),
          workloads,
          lastAssignedAt,
          priority,
          maxActive,
        });
        if (!candidate) return false;
        const authz = await this.identityUsers.getAuthz(candidate);
        if (
          authz &&
          authz.account_type === 'ADMIN' &&
          authz.staff_role === 'SUPPORT_AGENT' &&
          authz.status === 'ACTIVE'
        ) {
          picked = candidate;
          break;
        }
        ineligible.add(candidate);
      }

      const fromAdminId = ticket.assigned_admin_id;
      ticket.assigned_admin_id = picked;
      ticket.updated_at = new Date();
      await repo.save(ticket);

      const pickedWorkload = workloads.get(picked) ?? emptyWorkload(picked);
      await this.staysAudit.log({
        actorUserId: 'system',
        actorRole: 'SYSTEM',
        entityType: 'support_ticket',
        entityId: ticket.id,
        action: 'support_ticket_assigned',
        metadata: {
          fromAdminId,
          toAdminId: picked,
          source: 'AUTO',
          reason: 'LOWEST_ROUTING_SCORE',
          skillTier: tier.skillTier,
          categoryMatch: tier.categoryMatch,
          languageMatch: tier.languageMatch,
          language: ticket.requester_language ?? null,
          routingScore: calculateRoutingScore(pickedWorkload),
          eligibleAgents: tier.agentIds.length,
        },
      });
      return true;
    });
  }

  private async queryLastAssignmentTimes(
    manager: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    agentIds: string[],
  ): Promise<Map<string, number>> {
    const times = new Map<string, number>();
    if (agentIds.length === 0) return times;
    const rows = (await manager.query(
      `
      SELECT metadata->>'toAdminId' AS agent_id, MAX(created_at) AS last_assigned_at
      FROM stays_audit_logs
      WHERE action = 'support_ticket_assigned'
        AND metadata->>'toAdminId' = ANY($1)
      GROUP BY metadata->>'toAdminId'
      `,
      [agentIds],
    )) as { agent_id: string; last_assigned_at: Date | string | null }[];
    for (const row of rows) {
      if (!row.agent_id || !row.last_assigned_at) continue;
      times.set(row.agent_id, new Date(row.last_assigned_at).getTime());
    }
    return times;
  }
}
