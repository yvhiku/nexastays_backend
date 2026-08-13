import { ConversationPresentationService } from './conversation-presentation.service';
import { StaysConversation } from './entities/stays-conversation.entity';

describe('ConversationPresentationService', () => {
  it('renders SUPPORT threads without host lookup or stay dates', async () => {
    const service = new ConversationPresentationService(
      {} as never,
      {} as never,
      {
        resolveCounterpartIdentity: jest.fn(() => {
          throw new Error('should not resolve booking counterpart for SUPPORT');
        }),
      } as never,
      {
        getProfileSummary: jest.fn(() => {
          throw new Error('should not load counterpart profile for SUPPORT');
        }),
      } as never,
    );

    const presentation = await service.buildPresentation(
      {
        id: 'conv-1',
        type: 'SUPPORT',
        guest_user_id: 'guest-1',
        host_user_id: null,
        booking_id: null,
        listing_id: 'listing-1',
        messaging_state: 'ACTIVE',
        snapshot_version: 1,
      } as StaysConversation,
      'guest-1',
      {
        listingTitle: '[SUSPICIOUS_ACTIVITY] test',
        bookingReference: 'SUP-2026-000001',
        checkinDate: '',
        checkoutDate: '',
        guestCount: 0,
      },
    );

    expect(presentation.title).toBe('Nexa Support');
    expect(presentation.statusChip).toBe('Support');
    expect(presentation.subtitle).toBe('SUP-2026-000001');
    expect(presentation.listing.title).toBe('[SUSPICIOUS_ACTIVITY] test');
    expect(presentation.counterpart.displayName).toBe('Nexa Support');
  });
});
