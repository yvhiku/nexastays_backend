import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { StaysMediaAsset } from './entities/stays-media-asset.entity';
import {
  detectAttachmentMime,
  extensionForMime,
  isImageMime,
  type AllowedAttachmentMime,
} from '../../common/utils/attachment-mime.util';
import { MediaStorageService } from '../../common/media/media-storage.module';
import { assertSafeRelativeStorageKey } from '../../common/media/media-storage-policy';

const THUMB_MAX_PX = 640;

export interface ProcessedMediaInput {
  buffer: Buffer;
  declaredMime: string;
  conversationId: string;
}

export interface ProcessedMediaResult {
  asset: StaysMediaAsset;
  storageKey: string;
  thumbnailKey: string | null;
  mime: AllowedAttachmentMime;
  width: number | null;
  height: number | null;
  checksum: string;
}

@Injectable()
export class MediaAssetService {
  private readonly uploadRoot =
    process.env.MEDIA_STORAGE_ROOT?.trim() || 'uploads';

  constructor(
    @InjectRepository(StaysMediaAsset)
    private readonly assetRepo: Repository<StaysMediaAsset>,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async processAndStore(input: ProcessedMediaInput): Promise<ProcessedMediaResult> {
    const detected = detectAttachmentMime(input.buffer);
    if (!detected) {
      throw new Error('Unsupported or invalid file content');
    }

    const declared = input.declaredMime?.toLowerCase() ?? '';
    if (declared && !declared.startsWith('application/octet') && declared !== detected) {
      if (!(declared === 'image/jpg' && detected === 'image/jpeg')) {
        throw new Error('File content does not match declared type');
      }
    }

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const assetId = randomUUID();
    const ext = extensionForMime(detected);
    const storageKey = `messaging/${input.conversationId}/${assetId}${ext}`;

    await this.mediaStorage.store({
      buffer: input.buffer,
      relativeKey: storageKey,
      mimeType: detected,
      assetId,
    });

    let width: number | null = null;
    let height: number | null = null;
    let orientation: number | null = null;
    let thumbnailKey: string | null = null;

    if (isImageMime(detected)) {
      const meta = await sharp(input.buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      orientation = meta.orientation ?? null;

      const thumbBuffer = await sharp(input.buffer)
        .rotate()
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      thumbnailKey = `messaging/${input.conversationId}/${assetId}_thumb.jpg`;
      await this.mediaStorage.store({
        buffer: thumbBuffer,
        relativeKey: thumbnailKey,
        mimeType: 'image/jpeg',
        assetId: randomUUID(),
      });
    }

    const asset = this.assetRepo.create({
      storage_key: storageKey,
      checksum_sha256: checksum,
      mime: detected,
      size_bytes: String(input.buffer.length),
      width,
      height,
      orientation,
      duration_ms: null,
      thumbnail_storage_key: thumbnailKey,
      encryption_key_id: null,
      media_version: 1,
    });

    const saved = await this.assetRepo.save(asset);
    return {
      asset: saved,
      storageKey,
      thumbnailKey,
      mime: detected,
      width,
      height,
      checksum,
    };
  }

  /**
   * Local absolute path for streaming when backend is local.
   * Callers that receive http(s) URLs must redirect instead.
   */
  resolveStoragePath(storageKey: string): string {
    return assertSafeRelativeStorageKey(this.uploadRoot, storageKey);
  }

  resolveDelivery(storageKey: string): Promise<string> {
    return this.mediaStorage.resolveDelivery(storageKey);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.mediaStorage.delete(storageKey);
  }
}
