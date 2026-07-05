import { Injectable } from '@nestjs/common';

/**
 * In-flight request coalescing: for the same key, only one Promise is created;
 * concurrent callers share the same Promise and thus one DB query.
 * Prevents burst traffic from issuing duplicate identical queries.
 */
@Injectable()
export class RequestCoalescingService {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Run the async function once per key; concurrent calls with the same key
   * receive the same Promise. Key is removed from the map when the Promise settles.
   */
  async coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = fn()
      .then((result) => {
        this.inFlight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });
    this.inFlight.set(key, promise);
    return promise;
  }
}
