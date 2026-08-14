import { NotFoundException } from '@nestjs/common';

export type SupportStaffRole = 'ADMIN' | 'SUPPORT_AGENT';

export type SupportStaffActor = {
  userId: string;
  role: SupportStaffRole;
};

export const DEFAULT_ADMIN_ACTOR: SupportStaffActor = {
  userId: '',
  role: 'ADMIN',
};

const TICKET_NOT_FOUND = 'Ticket not found';

/**
 * Staff actor from JWT claims only. Never synthesize ADMIN from account_type.
 */
export function staffActorFromUser(user: {
  userId?: string;
  role?: string;
  roles?: string[];
}): SupportStaffActor {
  const userId = String(user.userId ?? '');
  const roles =
    Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles.map(String)
      : user.role
        ? [String(user.role)]
        : [];
  if (roles.includes('ADMIN')) {
    return { userId, role: 'ADMIN' };
  }
  return { userId, role: 'SUPPORT_AGENT' };
}

export function isSupportAgentActor(actor: SupportStaffActor): boolean {
  return actor.role === 'SUPPORT_AGENT';
}

export function assertCanAccessTicket(
  ticket: { assigned_admin_id?: string | null } | null | undefined,
  actor: SupportStaffActor,
): asserts ticket is NonNullable<typeof ticket> {
  if (!ticket) {
    throw new NotFoundException(TICKET_NOT_FOUND);
  }
  if (actor.role === 'ADMIN') return;
  if (
    actor.role === 'SUPPORT_AGENT' &&
    ticket.assigned_admin_id === actor.userId
  ) {
    return;
  }
  throw new NotFoundException(TICKET_NOT_FOUND);
}
