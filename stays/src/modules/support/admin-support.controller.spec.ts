import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AdminSupportController } from './admin-support.controller';

describe('AdminSupportController roles', () => {
  it('keeps operations, analytics, workload, and global signals ADMIN-only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminSupportController)).toEqual([
      'ADMIN',
    ]);
    for (const method of [
      'operationsOverview',
      'operationsAttention',
      'agentWorkload',
      'supportAnalytics',
      'listSignals',
    ] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          AdminSupportController.prototype[method],
        ),
      ).toBeUndefined();
    }
  });

  it('keeps ticket isolation methods open to SUPPORT_AGENT', () => {
    for (const method of [
      'listTickets',
      'listSupportReviews',
      'getTicket',
      'listMessages',
      'sendMessage',
      'listNotes',
      'createNote',
      'ticketActivity',
      'relatedTickets',
      'ticketSignals',
      'patchTicket',
      'patchSignal',
      'listCannedReplies',
    ] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          AdminSupportController.prototype[method],
        ),
      ).toEqual(['ADMIN', 'SUPPORT_AGENT']);
    }
  });
});
