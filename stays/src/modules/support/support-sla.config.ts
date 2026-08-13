import type { SupportTicketPriority } from './entities/stays-support-ticket.entity';

export const SUPPORT_SLA = {
  LOW: { firstResponseHours: 24, resolutionHours: 120 },
  NORMAL: { firstResponseHours: 12, resolutionHours: 72 },
  HIGH: { firstResponseHours: 4, resolutionHours: 24 },
  URGENT: { firstResponseHours: 1, resolutionHours: 8 },
} as const satisfies Record<
  SupportTicketPriority,
  { firstResponseHours: number; resolutionHours: number }
>;

export type SupportSlaState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED';

export type SupportSlaLeg = {
  targetAt: string;
  completedAt: string | null;
  state: SupportSlaState;
};

export type SupportSlaPayload = {
  firstResponse: SupportSlaLeg;
  /** First-resolution SLA (completed when resolved_at is set). */
  resolution: SupportSlaLeg;
};

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Incomplete: <80% ON_TRACK, 80–<100% AT_RISK, ≥100% BREACHED.
 * Complete: on/before target ON_TRACK, else BREACHED.
 */
export function slaStateFor(
  createdAt: Date,
  targetAt: Date,
  completedAt: Date | null,
  now: Date,
): SupportSlaState {
  if (completedAt) {
    return completedAt.getTime() <= targetAt.getTime() ? 'ON_TRACK' : 'BREACHED';
  }
  const windowMs = targetAt.getTime() - createdAt.getTime();
  if (windowMs <= 0) return 'BREACHED';
  const elapsed = now.getTime() - createdAt.getTime();
  const ratio = elapsed / windowMs;
  if (ratio < 0.8) return 'ON_TRACK';
  if (ratio < 1) return 'AT_RISK';
  return 'BREACHED';
}

export function computeSupportSla(
  input: {
    createdAt: Date;
    priority: SupportTicketPriority;
    firstAdminResponseAt: Date | null;
    resolvedAt: Date | null;
  },
  now: Date = new Date(),
): SupportSlaPayload {
  const policy = SUPPORT_SLA[input.priority] ?? SUPPORT_SLA.NORMAL;
  const frTarget = addHours(input.createdAt, policy.firstResponseHours);
  const resTarget = addHours(input.createdAt, policy.resolutionHours);
  return {
    firstResponse: {
      targetAt: frTarget.toISOString(),
      completedAt: input.firstAdminResponseAt?.toISOString() ?? null,
      state: slaStateFor(
        input.createdAt,
        frTarget,
        input.firstAdminResponseAt,
        now,
      ),
    },
    resolution: {
      targetAt: resTarget.toISOString(),
      completedAt: input.resolvedAt?.toISOString() ?? null,
      state: slaStateFor(input.createdAt, resTarget, input.resolvedAt, now),
    },
  };
}

const PRIORITY_RANK: Record<SupportTicketPriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4,
};

const CATEGORY_MIN_PRIORITY: Partial<
  Record<string, SupportTicketPriority>
> = {
  FRAUD: 'HIGH',
  KYC: 'HIGH',
  PAYMENT: 'NORMAL',
  REFUND: 'NORMAL',
  BOOKING: 'NORMAL',
  CANCELLATION: 'NORMAL',
  HOST: 'NORMAL',
  GUEST: 'NORMAL',
  LISTING: 'LOW',
  TECHNICAL: 'NORMAL',
  OTHER: 'LOW',
};

/**
 * Deterministic routing suggestion only — never auto-applied.
 * Never suggests below current priority when current is URGENT (or higher rank).
 */
export function suggestRouting(input: {
  category: string;
  currentPriority: SupportTicketPriority;
  hasReportId?: boolean;
  hasSafetyIssueId?: boolean;
}): { suggestedPriority: SupportTicketPriority; reason: string } {
  let suggested: SupportTicketPriority =
    CATEGORY_MIN_PRIORITY[input.category] ?? 'NORMAL';
  let reason = `Category ${input.category} → ${suggested}`;

  if (input.hasSafetyIssueId) {
    suggested = 'HIGH';
    reason = 'Linked safety issue → HIGH minimum';
  } else if (input.hasReportId) {
    suggested = 'HIGH';
    reason = 'Linked conversation report → HIGH minimum';
  }

  // Never downgrade URGENT (or any higher current priority).
  if (PRIORITY_RANK[input.currentPriority] > PRIORITY_RANK[suggested]) {
    return {
      suggestedPriority: input.currentPriority,
      reason: `Keep ${input.currentPriority} (never downgrade)`,
    };
  }
  return { suggestedPriority: suggested, reason };
}
