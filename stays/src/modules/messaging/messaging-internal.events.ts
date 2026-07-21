/** Internal messaging outbox events — handled locally, not published to domain event bus. */
export const MESSAGING_INTERNAL_EVENTS = {
  SNAPSHOT_REPAIR_REQUESTED: 'conversation.snapshot.repair.requested',
} as const;

export function isMessagingInternalEvent(eventType: string | null | undefined): boolean {
  if (!eventType) return false;
  return (
    eventType === MESSAGING_INTERNAL_EVENTS.SNAPSHOT_REPAIR_REQUESTED ||
    eventType.startsWith('conversation.')
  );
}
