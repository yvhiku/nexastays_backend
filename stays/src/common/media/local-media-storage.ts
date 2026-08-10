import * as fs from 'fs/promises';
import * as path from 'path';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';
import {
  assertSafeRelativeStorageKey,
  normalizeRelativeMediaKey,
} from './media-storage-policy';

/** Local disk — development / explicitly allowed non-production only. */
export class LocalMediaStorageBackend implements MediaStorageBackend {
  constructor(private readonly rootDir = process.env.MEDIA_STORAGE_ROOT ?? 'uploads') {}

  async store(params: {
    buffer: Buffer;
    relativeKey: string;
    mimeType: string;
    assetId: string;
  }): Promise<StoredMediaObject> {
    const storageKey = normalizeRelativeMediaKey(params.relativeKey);
    const fullPath = assertSafeRelativeStorageKey(this.rootDir, storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.buffer);
    return {
      assetId: params.assetId,
      storageKey,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
    };
  }

  async exists(relativeKey: string): Promise<boolean> {
    try {
      const fullPath = assertSafeRelativeStorageKey(
        this.rootDir,
        normalizeRelativeMediaKey(relativeKey),
      );
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async resolveDelivery(relativeKey: string): Promise<string> {
    return assertSafeRelativeStorageKey(
      this.rootDir,
      normalizeRelativeMediaKey(relativeKey),
    );
  }

  async delete(relativeKey: string): Promise<void> {
    const fullPath = assertSafeRelativeStorageKey(
      this.rootDir,
      normalizeRelativeMediaKey(relativeKey),
    );
    await fs.rm(fullPath, { force: true });
  }
}
