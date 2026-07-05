import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';

/** Local disk — canonical impl also in platform/media-service for future extraction. */
export class LocalMediaStorageBackend implements MediaStorageBackend {
  constructor(private readonly rootDir = process.env.MEDIA_STORAGE_ROOT ?? 'uploads') {}

  async store(params: {
    buffer: Buffer;
    relativePath: string;
    mimeType: string;
  }): Promise<StoredMediaObject> {
    const assetId = randomUUID();
    const ext = path.extname(params.relativePath) || '';
    const storageKey = path.join(params.relativePath, `${assetId}${ext}`).replace(/\\/g, '/');
    const fullPath = path.join(this.rootDir, storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.buffer);
    return {
      assetId,
      storageKey,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
    };
  }

  resolvePath(storageKey: string): string {
    return path.resolve(this.rootDir, storageKey);
  }
}
