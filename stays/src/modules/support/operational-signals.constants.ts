export const OPERATIONAL_SIGNAL_TYPES = [
  'REPEAT_REPORT',
  'REPEAT_SAFETY_REPORT',
  'MULTIPLE_OPEN_TICKETS',
  'SLA_ATTENTION',
  'SLA_BREACHED',
  'UNASSIGNED_HIGH_PRIORITY',
  'LOW_CSAT_PATTERN',
  'FOLLOW_UP_REQUIRED',
  'AGENT_LOW_CSAT_PATTERN',
  'AGENT_LOW_SOLVED_RATE',
  'AGENT_SLA_DECLINE',
  'CATEGORY_OUTCOME_DECLINE',
] as const;

export type OperationalSignalType = (typeof OPERATIONAL_SIGNAL_TYPES)[number];

export const OPERATIONAL_SIGNAL_SEVERITIES = [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;

export type OperationalSignalSeverity =
  (typeof OPERATIONAL_SIGNAL_SEVERITIES)[number];

export const OPERATIONAL_SIGNAL_STATUSES = [
  'ACTIVE',
  'ACKNOWLEDGED',
  'RESOLVED',
] as const;

export type OperationalSignalStatus =
  (typeof OPERATIONAL_SIGNAL_STATUSES)[number];

export const OPERATIONAL_SIGNAL_SUBJECT_TYPES = [
  'TICKET',
  'USER',
  'ADMIN',
  'REPORT',
  'SAFETY_ISSUE',
  'CATEGORY',
] as const;

export type OperationalSignalSubjectType =
  (typeof OPERATIONAL_SIGNAL_SUBJECT_TYPES)[number];

export const OPERATIONAL_RULE_VERSION = 'v1';

export const SEVERE_SAFETY_CATEGORIES = [
  'THREATS_HARASSMENT',
  'FEEL_UNSAFE',
] as const;

export const REPEAT_REPORT_WINDOW_DAYS = 7;
export const REPEAT_REPORT_MIN_COUNT = 3;
export const REPEAT_SAFETY_WINDOW_DAYS = 7;
export const REPEAT_SAFETY_MIN_COUNT = 2;
export const MULTIPLE_OPEN_TICKETS_MIN = 3;
export const LOW_CSAT_WINDOW_DAYS = 30;
export const LOW_CSAT_MIN_RESPONSES = 5;
export const LOW_CSAT_LOW_RATING_MAX = 2;
export const LOW_CSAT_LOW_RATING_MIN_COUNT = 2;

export function signalDedupeKey(
  type: OperationalSignalType,
  subjectType: OperationalSignalSubjectType,
  subjectId: string,
): string {
  return `${OPERATIONAL_RULE_VERSION}:${type}:${subjectType}:${subjectId}`;
}

export type SignalReasonCode =
  | 'REPEAT_REPORT_THRESHOLD'
  | 'REPEAT_SAFETY_THRESHOLD'
  | 'REPEAT_SAFETY_SEVERE_CATEGORY'
  | 'MULTIPLE_OPEN_TICKETS'
  | 'FIRST_RESPONSE_AT_RISK'
  | 'FIRST_RESOLUTION_AT_RISK'
  | 'FIRST_RESPONSE_BREACHED'
  | 'FIRST_RESOLUTION_BREACHED'
  | 'UNASSIGNED_HIGH_PRIORITY'
  | 'LOW_CSAT_PATTERN'
  | 'CUSTOMER_REPORTED_UNRESOLVED'
  | 'AGENT_LOW_CSAT_PATTERN'
  | 'AGENT_LOW_SOLVED_RATE'
  | 'AGENT_SLA_DECLINE'
  | 'CATEGORY_OUTCOME_DECLINE';

export function explanationForReason(
  code: SignalReasonCode,
  metadata: Record<string, unknown> = {},
): string {
  const count = Number(metadata.count ?? 0);
  const windowDays = Number(metadata.windowDays ?? 0);
  switch (code) {
    case 'REPEAT_REPORT_THRESHOLD':
      return `${count} reports against the same user within ${windowDays} days.`;
    case 'REPEAT_SAFETY_THRESHOLD':
      return `${count} safety issues against the same user within ${windowDays} days.`;
    case 'REPEAT_SAFETY_SEVERE_CATEGORY':
      return `${count} safety issues against the same user within ${windowDays} days, including a severe category.`;
    case 'MULTIPLE_OPEN_TICKETS':
      return `${count} open tickets for the same requester.`;
    case 'FIRST_RESPONSE_AT_RISK':
      return 'First-response SLA is at risk.';
    case 'FIRST_RESOLUTION_AT_RISK':
      return 'First-resolution SLA is at risk.';
    case 'FIRST_RESPONSE_BREACHED':
      return 'First-response SLA is breached.';
    case 'FIRST_RESOLUTION_BREACHED':
      return 'First-resolution SLA is breached.';
    case 'UNASSIGNED_HIGH_PRIORITY':
      return 'High-priority ticket is unassigned.';
    case 'LOW_CSAT_PATTERN':
      return `${count} low CSAT ratings (≤2) within ${windowDays} days.`;
    case 'CUSTOMER_REPORTED_UNRESOLVED':
      return 'Customer says issue was not solved.';
    case 'AGENT_LOW_CSAT_PATTERN':
      return `Average agent rating ${metadata.averageAgentRating ?? '—'} across ${count} reviews.`;
    case 'AGENT_LOW_SOLVED_RATE':
      return `Problem-solved rate ${metadata.problemSolvedRate ?? '—'} across ${count} reviews.`;
    case 'AGENT_SLA_DECLINE':
      return `First-response SLA declined to ${metadata.recentSla ?? '—'} from ${metadata.baselineSla ?? '—'}.`;
    case 'CATEGORY_OUTCOME_DECLINE':
      return `Solved rate for ${metadata.category ?? 'category'} declined to ${metadata.solvedRate ?? '—'} from ${metadata.previousSolvedRate ?? '—'}.`;
    default:
      return 'Operational signal.';
  }
}
