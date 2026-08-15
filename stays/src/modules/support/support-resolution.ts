export const SUPPORT_RESOLUTION_TYPES = [
  'ISSUE_FIXED',
  'INFORMATION_PROVIDED',
  'PAYMENT_RESOLVED',
  'BOOKING_UPDATED',
  'POLICY_EXPLAINED',
  'DUPLICATE',
  'NO_ACTION_POSSIBLE',
  'OTHER',
] as const;

export type SupportResolutionType =
  (typeof SUPPORT_RESOLUTION_TYPES)[number];

export function resolutionLabel(type: string | null | undefined): string {
  switch (type) {
    case 'ISSUE_FIXED':
      return 'Issue fixed';
    case 'INFORMATION_PROVIDED':
      return 'Information provided';
    case 'PAYMENT_RESOLVED':
      return 'Payment resolved';
    case 'BOOKING_UPDATED':
      return 'Booking updated';
    case 'POLICY_EXPLAINED':
      return 'Policy explained';
    case 'DUPLICATE':
      return 'Duplicate';
    case 'NO_ACTION_POSSIBLE':
      return 'No action possible';
    case 'OTHER':
      return 'Other';
    default:
      return type ? type.replace(/_/g, ' ').toLowerCase() : '';
  }
}
