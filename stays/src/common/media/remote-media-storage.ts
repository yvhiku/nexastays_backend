import * as fs from 'fs/promises';
import * as path from 'path';
import { CircuitBreaker, retryWithBackoff } from '@nexa/event-bus';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';
import { getInternalServiceKey } from '../security/secrets';
import { normalizeRelativeMediaKey } from './media-storage-policy';

const CLAIM_ROOT = process.env.MEDIA_REMOTE_CLAIM_ROOT ?? 'uploads/_remote_claims';

/**
 * Remote backend — delegates bytes to platform/media-service.
 * Writes a local claim sidecar so ownership/exists checks stay key-compatible.
 */
export class RemoteMediaStorageBackend implements MediaStorageBackend {
  private readonly breaker = new CircuitBreaker({
    name: 'media-service',
    failureThreshold: 5,
    resetTimeoutMs: 20_000,
  });

  constructor(private readonly baseUrl: string) {}

  private claimPath(relativeKey: string): string {
    const key = normalizeRelativeMediaKey(relativeKey);
    return path.join(CLAIM_ROOT, `${key}.json`);
  }

  private async writeClaim(
    relativeKey: string,
    data: { storageKey: string; assetId: string; mimeType: string },
  ): Promise<void> {
    const claimFile = this.claimPath(relativeKey);
    await fs.mkdir(path.dirname(claimFile), { recursive: true });
    await fs.writeFile(claimFile, JSON.stringify(data));
  }

  private async readClaim(
    relativeKey: string,
  ): Promise<{ storageKey: string; assetId: string; mimeType: string } | null> {
    try {
      const raw = await fs.readFile(this.claimPath(relativeKey), 'utf8');
      return JSON.parse(raw) as {
        storageKey: string;
        assetId: string;
        mimeType: string;
      };
    } catch {
      return null;
    }
  }

  async store(params: {
    buffer: Buffer;
    relativeKey: string;
    mimeType: string;
    assetId: string;
  }): Promise<StoredMediaObject> {
    const relativeKey = normalizeRelativeMediaKey(params.relativeKey);
    const dirPrefix = relativeKey.includes('/')
      ? relativeKey.slice(0, relativeKey.lastIndexOf('/'))
      : 'stays';
    const filename = relativeKey.includes('/')
      ? relativeKey.slice(relativeKey.lastIndexOf('/') + 1)
      : relativeKey;

    return this.breaker.execute(() =>
      retryWithBackoff(
        async () => {
          const form = new FormData();
          form.append(
            'file',
            new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
            filename,
          );
          form.append('ownerService', 'stays');
          form.append('prefix', `stays/${dirPrefix}`.replace(/\/+/g, '/'));
          form.append('assetId', params.assetId);

          const res = await fetch(
            `${this.baseUrl.replace(/\/$/, '')}/api/v1/media/upload`,
            {
              method: 'POST',
              headers: {
                'X-Internal-Key': getInternalServiceKey(),
              },
              body: form,
            },
          );
          if (!res.ok) throw new Error(`media upload HTTP ${res.status}`);
          const data = (await res.json()) as {
            assetId: string;
            storageKey: string;
            mimeType: string;
            sizeBytes: number;
          };

          await this.writeClaim(relativeKey, {
            storageKey: data.storageKey,
            assetId: data.assetId,
            mimeType: data.mimeType,
          });

          return {
            assetId: data.assetId,
            storageKey: relativeKey,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
          };
        },
        { attempts: 2 },
      ),
    );
  }

  async exists(relativeKey: string): Promise<boolean> {
    return !!(await this.readClaim(relativeKey));
  }

  async resolveDelivery(relativeKey: string): Promise<string> {
    const claim = await this.readClaim(relativeKey);
    if (!claim) {
      throw new Error('Remote media claim not found');
    }
    const res = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/api/v1/media/signed-url`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': getInternalServiceKey(),
        },
        body: JSON.stringify({
          storageKey: claim.storageKey,
          ttlSeconds: Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 900),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`media signed-url HTTP ${res.status}`);
    }
    const data = (await res.json()) as { signedUrl: string };
    return data.signedUrl;
  }

  async delete(relativeKey: string): Promise<void> {
    const claimFile = this.claimPath(relativeKey);
    await fs.rm(claimFile, { force: true });
  }
}
