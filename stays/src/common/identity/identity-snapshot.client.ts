import { Injectable, Logger } from '@nestjs/common';
import { IdentityReadModel } from '@nexa/identity-read-model';
import type { IdentitySnapshot } from './identity-snapshot.types';

/**
 * Cache-first identity snapshot access for Stays.
 *
 * Flow: Redis read model → (miss) → Identity /snapshots/me (retry + circuit breaker).
 * Stays never decodes KYC from JWT and never hits Identity DB directly.
 */
@Injectable()
export class IdentitySnapshotClient {
  private readonly logger = new Logger(IdentitySnapshotClient.name);
  private readonly readModel: IdentityReadModel;

  constructor() {
    const baseUrl =
      process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ??
      'http://127.0.0.1:3001/api/v1';
    this.readModel = new IdentityReadModel({
      identityBaseUrl: baseUrl,
      redisUrl: process.env.REDIS_URL,
      ttlMs: Number(process.env.IDENTITY_READ_MODEL_TTL_MS ?? 120_000),
      serviceName: 'stays',
    });
  }

  /**
   * @param authorizationHeader Bearer token of the calling user (fallback auth).
   * @param userId JWT `sub` — enables the Redis cache path. Always pass it.
   */
  async fetchSnapshot(
    authorizationHeader: string,
    userId?: string,
  ): Promise<IdentitySnapshot | null> {
    if (!authorizationHeader?.startsWith('Bearer ')) return null;
    const snapshot = userId
      ? await this.readModel.getSnapshot(userId, authorizationHeader)
      : await this.readModel.getSnapshot('__direct__', authorizationHeader);
    if (!snapshot) {
      this.logger.warn('Identity snapshot unavailable (cache miss + API failure)');
      return null;
    }
    return snapshot as unknown as IdentitySnapshot;
  }

  /** Invalidate cached snapshot — wire to kyc.updated.v1 consumer. */
  invalidate(userId: string): Promise<void> {
    return this.readModel.invalidate(userId);
  }
}
