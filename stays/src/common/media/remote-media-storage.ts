import { CircuitBreaker, retryWithBackoff } from '@nexa/event-bus';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';

/**
 * Remote backend — delegates storage to platform/media-service (:3004).
 * Selected with MEDIA_SERVICE_URL; guarded by retry + circuit breaker.
 */
export class RemoteMediaStorageBackend implements MediaStorageBackend {
  private readonly breaker = new CircuitBreaker({
    name: 'media-service',
    failureThreshold: 5,
    resetTimeoutMs: 20_000,
  });

  constructor(private readonly baseUrl: string) {}

  async store(params: {
    buffer: Buffer;
    relativePath: string;
    mimeType: string;
  }): Promise<StoredMediaObject> {
    return this.breaker.execute(() =>
      retryWithBackoff(
        async () => {
          const form = new FormData();
          form.append(
            'file',
            new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
            params.relativePath.split('/').pop() ?? 'upload.bin',
          );
          form.append('ownerService', 'stays');
          form.append('prefix', `stays/${params.relativePath}`.replace(/\\/g, '/'));

          const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/v1/media/upload`, {
            method: 'POST',
            headers: {
              'X-Internal-Key': process.env.INTERNAL_SERVICE_KEY ?? 'dev-internal-key',
            },
            body: form,
          });
          if (!res.ok) throw new Error(`media upload HTTP ${res.status}`);
          const data = (await res.json()) as {
            assetId: string;
            storageKey: string;
            mimeType: string;
            sizeBytes: number;
            signedUrl: string;
          };
          return {
            assetId: data.assetId,
            storageKey: data.storageKey,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
          };
        },
        { attempts: 2 },
      ),
    );
  }

  resolvePath(storageKey: string): string {
    // Remote assets are addressed by signed URL, not a local path.
    return `${this.baseUrl.replace(/\/$/, '')}/api/v1/media/file?key=${encodeURIComponent(storageKey)}`;
  }
}
