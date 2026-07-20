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

  it('denies send when conversation is locked', () => {
    const conv = baseConversation();
    conv.messaging_state = 'LOCKED';
    expect(service.resolve(conv, 'guest-1').canSend).toBe(false);
    expect(service.resolve(conv, 'guest-1').isReadOnly).toBe(true);
  });

  it('returns visibility per participant', () => {
    const conv = baseConversation();
    conv.guest_visibility = 'ARCHIVED';
    expect(service.visibilityFor(conv, 'guest-1')).toBe('ARCHIVED');
    expect(service.visibilityFor(conv, 'host-1')).toBe('ACTIVE');
  });
});
