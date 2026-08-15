import { MessagingPermissionsService } from './permissions.service';
import type { StaysConversation } from './entities/stays-conversation.entity';

describe('MessagingPermissionsService', () => {
  const service = new MessagingPermissionsService();

  const baseConversation = (): StaysConversation =>
    ({
      guest_user_id: 'guest-1',
      host_user_id: 'host-1',
      messaging_state: 'ACTIVE',
      blocked_by_guest: false,
      blocked_by_host: false,
      guest_visibility: 'ACTIVE',
      host_visibility: 'ACTIVE',
      notification_level_guest: 'ALL',
      notification_level_host: 'MUTED',
    }) as StaysConversation;

  it('exposes reserved notificationLevel per participant', () => {
    const conv = baseConversation();
    expect(service.resolve(conv, 'guest-1').notificationLevel).toBe('ALL');
    expect(service.resolve(conv, 'host-1').notificationLevel).toBe('MUTED');
  });

  it('denies send when a SUPPORT ticket is closed even if still ACTIVE', () => {
    const conv = baseConversation();
    conv.type = 'SUPPORT';
    expect(
      service.resolve(conv, 'guest-1', { ticketClosed: true }).canSend,
    ).toBe(false);
    expect(
      service.resolve(conv, 'guest-1', { ticketClosed: true }).isReadOnly,
    ).toBe(true);
  });

  it('returns visibility per participant', () => {
    const conv = baseConversation();
    conv.guest_visibility = 'ARCHIVED';
    expect(service.visibilityFor(conv, 'guest-1')).toBe('ARCHIVED');
    expect(service.visibilityFor(conv, 'host-1')).toBe('ACTIVE');
  });

  it('allows ADMIN access only on SUPPORT conversations', () => {
    const booking = baseConversation();
    (booking as { type?: string }).type = 'BOOKING';
    expect(service.isParticipant(booking, 'admin-1', { isAdmin: true })).toBe(
      false,
    );

    const support = baseConversation();
    (support as { type?: string }).type = 'SUPPORT';
    support.guest_user_id = 'guest-1';
    support.host_user_id = null as unknown as string;
    expect(service.isParticipant(support, 'admin-1', { isAdmin: true })).toBe(
      true,
    );
    expect(service.resolve(support, 'admin-1', { isAdmin: true }).canSend).toBe(
      true,
    );
  });

  it('disables canReport on SUPPORT conversations for participants', () => {
    const support = baseConversation();
    (support as { type?: string }).type = 'SUPPORT';
    expect(service.resolve(support, 'guest-1').canReport).toBe(false);
    const booking = baseConversation();
    (booking as { type?: string }).type = 'BOOKING';
    expect(service.resolve(booking, 'guest-1').canReport).toBe(true);
  });
});
