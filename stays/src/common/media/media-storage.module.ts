import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { LocalMediaStorageBackend } from './local-media-storage';
import { RemoteMediaStorageBackend } from './remote-media-storage';
import type { MediaStorageBackend, StoredMediaObject } from './media-storage.interface';

/**
 * Storage abstraction for Stays uploads.
 *
 * MEDIA_SERVICE_URL set  → platform/media-service backend (circuit-broken HTTP)
 * MEDIA_SERVICE_URL unset → local disk (dev default, unchanged behavior)
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly backend: MediaStorageBackend;

  constructor() {
    const remoteUrl = process.env.MEDIA_SERVICE_URL;
    if (remoteUrl) {
      this.backend = new RemoteMediaStorageBackend(remoteUrl);
      this.logger.log(`Media storage: remote media-service at ${remoteUrl}`);
    } else {
      this.backend = new LocalMediaStorageBackend();
    }
  }

  store(params: {
    buffer: Buffer;
    relativePath: string;
    mimeType: string;
  }): Promise<StoredMediaObject> {
    return this.backend.store(params);
  }

  resolvePath(storageKey: string): string {
    return this.backend.resolvePath(storageKey);
  }
}

@Global()
@Module({
  providers: [MediaStorageService],
  exports: [MediaStorageService],
})
export class MediaStorageModule {}
