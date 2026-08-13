import type {
  SupportTicketParty,
  SupportTicketStatus,
} from '../entities/stays-support-ticket.entity';

/**
 * Customer-message ticket status transitions for SUPPORT threads.
 * Documented for Phase 1.1 — do not drift without an explicit product change.
 *
 * WAITING_FOR_HOST advances only when the ticket party is HOST.
 * RESOLVED → OPEN (resolved_at cleared by the caller).
 * CLOSED is rejected before this runs (409).
 */
export function nextStatusAfterCustomerMessage(input: {
  status: SupportTicketStatus;
  party: SupportTicketParty;
}): SupportTicketStatus {
  switch (input.status) {
    case 'RESOLVED':
    case 'WAITING_FOR_CUSTOMER':
      return 'OPEN';
    case 'WAITING_FOR_HOST':
      return input.party === 'HOST' ? 'OPEN' : 'WAITING_FOR_HOST';
    case 'OPEN':
    case 'IN_PROGRESS':
    case 'ESCALATED':
    case 'CLOSED':
      return input.status;
    default:
      return input.status;
  }
}

export const CLOSED_SUPPORT_TICKET_MESSAGE =
  'This support ticket is closed.';
