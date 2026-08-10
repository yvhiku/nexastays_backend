import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';
import { normalizeRelativeMediaKey } from './media-storage-policy';

/**
 * Optional direct S3 put from Stays (not the preferred production path).
 * Production fail-closed prefers MEDIA_SERVICE_URL.
 */
export class S3MediaStorageBackend implements MediaStorageBackend {
  private client: unknown = null;
  private readonly bucket = (process.env.MEDIA_S3_BUCKET ?? '').trim();

  private async getClient(): Promise<{
    send: (cmd: unknown) => Promise<unknown>;
  }> {
    if (this.client) {
      return this.client as { send: (cmd: unknown) => Promise<unknown> };
    }
    if (!this.bucket) {
      throw new Error('MEDIA_S3_BUCKET is required for S3 media backend');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3');
      this.client = new S3Client({
        endpoint: process.env.MEDIA_S3_ENDPOINT || undefined,
        region: process.env.MEDIA_S3_REGION ?? 'auto',
        forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE !== 'false',
        credentials:
          process.env.MEDIA_S3_ACCESS_KEY_ID &&
          process.env.MEDIA_S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
      return this.client as { send: (cmd: unknown) => Promise<unknown> };
    } catch {
      throw new Error(
        'S3 media backend selected but @aws-sdk/client-s3 is not installed in stays.',
      );
    }
  }

  async store(params: {
    buffer: Buffer;
    relativeKey: string;
    mimeType: string;
    assetId: string;
  }): Promise<StoredMediaObject> {
    const storageKey = `stays/${normalizeRelativeMediaKey(params.relativeKey)}`;
    const client = await this.getClient();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: params.buffer,
        ContentType: params.mimeType,
      }),
    );
    return {
      assetId: params.assetId,
      storageKey: normalizeRelativeMediaKey(params.relativeKey),
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
    };
  }

  async exists(_relativeKey: string): Promise<boolean> {
    // Optional; production path is media-service.
    return false;
  }

  async resolveDelivery(relativeKey: string): Promise<string> {
    const base =
      process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
      process.env.MEDIA_SERVICE_URL?.replace(/\/$/, '') ||
      '';
    if (!base) {
      throw new Error(
        'S3-stored objects require MEDIA_PUBLIC_BASE_URL or MEDIA_SERVICE_URL for delivery.',
      );
    }
    const key = `stays/${normalizeRelativeMediaKey(relativeKey)}`;
    return `${base}/api/v1/media/file?key=${encodeURIComponent(key)}`;
  }
}
