import { NotFoundException } from '@nestjs/common';
import {
  assertCanAccessTicket,
  staffActorFromUser,
} from './support-staff-access';

describe('support-staff-access', () => {
  it('derives ADMIN from JWT roles, not account_type', () => {
    expect(
      staffActorFromUser({
        userId: 'u1',
        role: 'ADMIN',
        roles: ['ADMIN'],
      }),
    ).toEqual({ userId: 'u1', role: 'ADMIN' });
  });

  it('does not treat account_type ADMIN as staff ADMIN', () => {
    expect(
      staffActorFromUser({
        userId: 'agent-1',
        role: 'SUPPORT_AGENT',
        roles: ['SUPPORT_AGENT'],
        account_type: 'ADMIN',
      } as { userId: string; role: string; roles: string[] }),
    ).toEqual({ userId: 'agent-1', role: 'SUPPORT_AGENT' });
  });

  it('allows ADMIN any ticket and agents only their assignment', () => {
    const admin = staffActorFromUser({ userId: 'admin-1', roles: ['ADMIN'] });
    const agentA = staffActorFromUser({
      userId: 'agent-a',
      roles: ['SUPPORT_AGENT'],
    });
    expect(() =>
      assertCanAccessTicket({ assigned_admin_id: 'agent-b' }, admin),
    ).not.toThrow();
    expect(() =>
      assertCanAccessTicket({ assigned_admin_id: 'agent-a' }, agentA),
    ).not.toThrow();
    expect(() =>
      assertCanAccessTicket({ assigned_admin_id: 'agent-b' }, agentA),
    ).toThrow(NotFoundException);
    expect(() =>
      assertCanAccessTicket({ assigned_admin_id: null }, agentA),
    ).toThrow(NotFoundException);
    expect(() => assertCanAccessTicket(null, agentA)).toThrow(NotFoundException);
  });
});
