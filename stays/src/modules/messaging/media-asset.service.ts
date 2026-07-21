import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { StaysMediaAsset } from './entities/stays-media-asset.entity';
import {
  detectAttachmentMime,
  extensionForMime,
  isImageMime,
  type AllowedAttachmentMime,
} from '../../common/utils/attachment-mime.util';

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
    const relDir = join('messaging', input.conversationId);
    const absDir = join(this.uploadRoot, relDir);
    await mkdir(absDir, { recursive: true });

    const filename = `${assetId}${ext}`;
    const storageKey = join(relDir, filename).replace(/\\/g, '/');
    const absPath = join(absDir, filename);
    await writeFile(absPath, input.buffer);

    let width: number | null = null;
    let height: number | null = null;
    let orientation: number | null = null;
    let thumbnailKey: string | null = null;

    if (isImageMime(detected)) {
      const meta = await sharp(input.buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      orientation = meta.orientation ?? null;

      const thumbFilename = `${assetId}_thumb.jpg`;
      const thumbAbs = join(absDir, thumbFilename);
      await sharp(input.buffer)
        .rotate()
        .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(thumbAbs);
      thumbnailKey = join(relDir, thumbFilename).replace(/\\/g, '/');
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

  resolveStoragePath(storageKey: string): string {
    return join(this.uploadRoot, storageKey);
  }
}
