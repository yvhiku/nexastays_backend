import { MessagingRealtimeService } from './messaging-realtime.service';

describe('MessagingRealtimeService', () => {
  it('publishes conversation events only to the intended user', () => {
    const service = new MessagingRealtimeService();
    const firstUserEvents: unknown[] = [];
    const secondUserEvents: unknown[] = [];
    const first = service.stream('user-1').subscribe((event) => {
      if (event.type === 'conversation.changed') firstUserEvents.push(event.data);
    });
    const second = service.stream('user-2').subscribe((event) => {
      if (event.type === 'conversation.changed') secondUserEvents.push(event.data);
    });

    service.publish('user-1', {
      conversationId: 'conversation-1',
      reason: 'MESSAGE_READ',
      messageId: 'message-1',
    });

    expect(firstUserEvents).toEqual([
      expect.objectContaining({
        type: 'conversation.changed',
        conversationId: 'conversation-1',
        reason: 'MESSAGE_READ',
        messageId: 'message-1',
      }),
    ]);
    expect(secondUserEvents).toEqual([]);

    first.unsubscribe();
    second.unsubscribe();
  });
});
