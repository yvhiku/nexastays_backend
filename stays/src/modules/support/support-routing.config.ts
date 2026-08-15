import type {
  SupportTicketCategory,
  SupportTicketPriority,
} from './entities/stays-support-ticket.entity';

/** Shared PostgreSQL advisory lock for auto-assignment (int4 range). */
export const SUPPORT_ROUTING_ADVISORY_LOCK = 874512031;

export const SUPPORT_ROUTING_SCORE_WEIGHTS = {
  active: 1,
  inProgress: 1.5,
  waiting: 0.5,
  atRisk: 4,
  breached: 8,
} as const;

export const SUPPORT_ROUTING_URGENT_HEADROOM = 0.7;
export const SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT_DEFAULT = 20;

export type RoutingAgentWorkload = {
  agentId: string;
  assigned: number;
  inProgress: number;
  waiting: number;
  atRisk: number;
  breached: number;
};

export type RoutingAgentSkills = {
  languages: string[];
  categories: string[];
};

export type RoutingSkillTier =
  | 'CATEGORY_AND_LANGUAGE'
  | 'CATEGORY'
  | 'LANGUAGE'
  | 'GENERAL';

export function isSupportAutoAssignEnabled(): boolean {
  const raw = process.env.SUPPORT_AUTO_ASSIGN;
  if (raw == null || raw.trim() === '') return true;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

export function maxActiveTicketsPerAgent(): number {
  const n = Number(process.env.SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT);
  if (!Number.isFinite(n) || n < 1) {
    return SUPPORT_MAX_ACTIVE_TICKETS_PER_AGENT_DEFAULT;
  }
  return Math.floor(n);
}

export function emptyWorkload(agentId: string): RoutingAgentWorkload {
  return {
    agentId,
    assigned: 0,
    inProgress: 0,
    waiting: 0,
    atRisk: 0,
    breached: 0,
  };
}

export function calculateRoutingScore(workload: RoutingAgentWorkload): number {
  return (
    workload.assigned * SUPPORT_ROUTING_SCORE_WEIGHTS.active +
    workload.inProgress * SUPPORT_ROUTING_SCORE_WEIGHTS.inProgress +
    workload.waiting * SUPPORT_ROUTING_SCORE_WEIGHTS.waiting +
    workload.atRisk * SUPPORT_ROUTING_SCORE_WEIGHTS.atRisk +
    workload.breached * SUPPORT_ROUTING_SCORE_WEIGHTS.breached
  );
}

function prefersUrgentHeadroom(priority: SupportTicketPriority): boolean {
  return priority === 'HIGH' || priority === 'URGENT';
}

/** Capacity first, then urgent headroom. Empty skill arrays are not wildcards. */
export function capacityEligibleAgentIds(input: {
  agentIds: string[];
  workloads: Map<string, RoutingAgentWorkload>;
  priority: SupportTicketPriority;
  maxActive: number;
  urgentHeadroom?: number;
}): string[] {
  const headroom = input.urgentHeadroom ?? SUPPORT_ROUTING_URGENT_HEADROOM;
  const unique = [...new Set(input.agentIds.filter(Boolean))];
  const underCap = unique.filter((id) => {
    const assigned = input.workloads.get(id)?.assigned ?? 0;
    return assigned < input.maxActive;
  });
  if (underCap.length === 0) return [];
  if (prefersUrgentHeadroom(input.priority)) {
    const preferred = underCap.filter((id) => {
      const assigned = input.workloads.get(id)?.assigned ?? 0;
      return assigned < input.maxActive * headroom;
    });
    if (preferred.length > 0) return preferred;
  }
  return underCap;
}

function matchesCategory(
  skills: RoutingAgentSkills | undefined,
  category: string,
): boolean {
  return (skills?.categories ?? []).includes(category);
}

function matchesLanguage(
  skills: RoutingAgentSkills | undefined,
  language: string | null,
): boolean {
  if (!language) return false;
  return (skills?.languages ?? []).includes(language);
}

export function pickSkillTier(input: {
  agentIds: string[];
  skills: Map<string, RoutingAgentSkills>;
  category: SupportTicketCategory | string;
  language: string | null;
}): {
  agentIds: string[];
  skillTier: RoutingSkillTier;
  categoryMatch: boolean;
  languageMatch: boolean;
} {
  const catLang = input.agentIds.filter(
    (id) =>
      matchesCategory(input.skills.get(id), input.category) &&
      matchesLanguage(input.skills.get(id), input.language),
  );
  if (catLang.length > 0) {
    return {
      agentIds: catLang,
      skillTier: 'CATEGORY_AND_LANGUAGE',
      categoryMatch: true,
      languageMatch: true,
    };
  }
  const cat = input.agentIds.filter((id) =>
    matchesCategory(input.skills.get(id), input.category),
  );
  if (cat.length > 0) {
    return {
      agentIds: cat,
      skillTier: 'CATEGORY',
      categoryMatch: true,
      languageMatch: false,
    };
  }
  const lang = input.agentIds.filter((id) =>
    matchesLanguage(input.skills.get(id), input.language),
  );
  if (lang.length > 0) {
    return {
      agentIds: lang,
      skillTier: 'LANGUAGE',
      categoryMatch: false,
      languageMatch: true,
    };
  }
  return {
    agentIds: input.agentIds,
    skillTier: 'GENERAL',
    categoryMatch: false,
    languageMatch: false,
  };
}

/**
 * Lowest score wins. Ties: lowest active count, then oldest last assignment
 * (missing timestamp counts as never assigned), then stable agent id.
 * Returns null when nobody is under capacity.
 */
export function selectBestAgent(input: {
  agentIds: string[];
  workloads: Map<string, RoutingAgentWorkload>;
  lastAssignedAt: Map<string, number>;
  priority: SupportTicketPriority;
  maxActive: number;
  urgentHeadroom?: number;
}): string | null {
  const pool = capacityEligibleAgentIds(input);
  if (pool.length === 0) return null;

  pool.sort((a, b) => {
    const wa = input.workloads.get(a) ?? emptyWorkload(a);
    const wb = input.workloads.get(b) ?? emptyWorkload(b);
    const scoreDiff = calculateRoutingScore(wa) - calculateRoutingScore(wb);
    if (scoreDiff !== 0) return scoreDiff;
    if (wa.assigned !== wb.assigned) return wa.assigned - wb.assigned;
    const lastA = input.lastAssignedAt.get(a) ?? 0;
    const lastB = input.lastAssignedAt.get(b) ?? 0;
    if (lastA !== lastB) return lastA - lastB;
    return a.localeCompare(b);
  });

  return pool[0] ?? null;
}
