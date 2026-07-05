import { Injectable, Logger } from '@nestjs/common';
import {
  createEventBusPublisher,
  EventValidationError,
  type EventBusPublisher,
} from '@nexa/event-bus';

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly publisher: EventBusPublisher;

  constructor() {
    this.publisher = createEventBusPublisher();
  }

  /**
   * Publish a domain event (use EVENTS.* registry names).
   * Invalid events are REJECTED and logged as errors — never silently published.
   * Transport failures are absorbed (event bus has its own buffering/retry).
   */
  publish<T extends Record<string, unknown>>(type: string, source: string, payload: T) {
    return this.publisher.publish(type, source, payload).catch((err: unknown) => {
      if (err instanceof EventValidationError) {
        this.logger.error(
          `Rejected invalid event "${err.eventType}": ${err.issues.join('; ')}`,
        );
      } else {
        this.logger.warn(
          `Event publish transport failure for "${type}": ${err instanceof Error ? err.message : err}`,
        );
      }
      return undefined;
    });
  }
}
