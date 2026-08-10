import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { LocalMediaStorageBackend } from './local-media-storage';
import { RemoteMediaStorageBackend } from './remote-media-storage';
import { S3MediaStorageBackend } from './s3-media-storage';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';
import {
  assertProductionMediaStorageConfigured,
  hasMediaServiceUrl,
  isLocalMediaStorageAllowed,
  normalizeRelativeMediaKey,
  resolveMediaStage,
} from './media-storage-policy';

/**
 * Storage abstraction for Stays uploads (PROD-SEC-002).
 *
 * Selection:
 * 1. MEDIA_SERVICE_URL → remote media-service (required in NEXA_ENV=production)
 * 2. MEDIA_STORAGE_BACKEND=s3 → optional direct S3 (non-production / advanced)
 * 3. else local disk — only when stage permits
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly backend: MediaStorageBackend;

  constructor() {
    assertProductionMediaStorageConfigured();
    const stage = resolveMediaStage();
    const backend = (process.env.MEDIA_STORAGE_BACKEND || '')
      .trim()
      .toLowerCase();

    if (hasMediaServiceUrl()) {
      this.backend = new RemoteMediaStorageBackend(
        (process.env.MEDIA_SERVICE_URL || '').trim(),
      );
      this.logger.log(`Media storage: remote media-service (${stage})`);
    } else if (backend === 's3' && stage !== 'production') {
      this.backend = new S3MediaStorageBackend();
      this.logger.log(`Media storage: S3-compatible backend (${stage})`);
    } else if (isLocalMediaStorageAllowed()) {
      this.backend = new LocalMediaStorageBackend();
      this.logger.warn(
        `Media storage: LOCAL disk (${stage}). Not for real production.`,
      );
    } else {
      throw new Error(
        'No permitted media storage backend configured (PROD-SEC-002).',
      );
    }
  }

  store(params: {
    buffer: Buffer;
    relativeKey: string;
    mimeType: string;
    assetId: string;
  }): Promise<StoredMediaObject> {
    return this.backend.store({
      ...params,
      relativeKey: normalizeRelativeMediaKey(params.relativeKey),
    });
  }

  exists(relativeKey: string): Promise<boolean> {
    return this.backend.exists(normalizeRelativeMediaKey(relativeKey));
  }

  resolveDelivery(relativeKey: string): Promise<string> {
    return this.backend.resolveDelivery(normalizeRelativeMediaKey(relativeKey));
  }

  async delete(relativeKey: string): Promise<void> {
    if (this.backend.delete) {
      await this.backend.delete(normalizeRelativeMediaKey(relativeKey));
    }
  }

  /**
   * Find first existing key among candidates (extension probing).
   */
  async resolveFirstExisting(
    candidates: string[],
  ): Promise<{ relativeKey: string; delivery: string } | null> {
    for (const key of candidates) {
      if (await this.exists(key)) {
        return {
          relativeKey: key,
          delivery: await this.resolveDelivery(key),
        };
      }
    }
    return null;
  }
}

@Global()
@Module({
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
