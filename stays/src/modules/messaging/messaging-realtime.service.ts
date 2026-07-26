import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

export type MessagingRealtimeReason =
  | 'MESSAGE_CREATED'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ';

export type MessagingRealtimePayload = {
  type: 'conversation.changed';
  conversationId: string;
  reason: MessagingRealtimeReason;
  messageId?: string;
  emittedAt: string;
};

type Listener = (event: MessageEvent) => void;

@Injectable()
export class MessagingRealtimeService {
  private readonly listeners = new Map<string, Set<Listener>>();

  stream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const listener: Listener = (event) => subscriber.next(event);
      const userListeners = this.listeners.get(userId) ?? new Set<Listener>();
      userListeners.add(listener);
      this.listeners.set(userId, userListeners);

      subscriber.next({
        type: 'connected',
        data: {
          type: 'connected',
          emittedAt: new Date().toISOString(),
        },
      });

      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'heartbeat',
          data: {
            type: 'heartbeat',
            emittedAt: new Date().toISOString(),
          },
        });
      }, 15_000);

      return () => {
        clearInterval(heartbeat);
        const current = this.listeners.get(userId);
        current?.delete(listener);
        if (current?.size === 0) this.listeners.delete(userId);
      };
    });
  }

  publish(
    userId: string | null | undefined,
    input: Omit<MessagingRealtimePayload, 'type' | 'emittedAt'>,
  ): void {
    if (!userId) return;
    const event: MessagingRealtimePayload = {
      type: 'conversation.changed',
      ...input,
      emittedAt: new Date().toISOString(),
    };
    for (const listener of this.listeners.get(userId) ?? []) {
      listener({
        id: `${input.conversationId}:${input.messageId ?? input.reason}:${event.emittedAt}`,
        type: event.type,
        data: event,
      });
    }
  }
}
