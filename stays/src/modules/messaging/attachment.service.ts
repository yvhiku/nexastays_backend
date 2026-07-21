import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { unlink } from 'fs/promises';
import { Repository, In, IsNull, EntityManager } from 'typeorm';
import { StaysMessageAttachment } from './entities/stays-message-attachment.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMediaAsset } from './entities/stays-media-asset.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagingMediaService } from './messaging-media.service';
import { MediaAssetService } from './media-asset.service';
import { isImageMime } from '../../common/utils/attachment-mime.util';
import type { AttachmentDto } from './messaging.types';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_DECLARED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(StaysMessageAttachment)
    private readonly attachmentRepo: Repository<StaysMessageAttachment>,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysMediaAsset)
    private readonly mediaAssetRepo: Repository<StaysMediaAsset>,
    private readonly permissions: MessagingPermissionsService,
    private readonly media: MessagingMediaService,
    private readonly mediaAssets: MediaAssetService,
  ) {}

  /** @deprecated Prefer attachment session upload flow */
  async createFromUpload(
    conversationId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    const conv = await this.getWritableConversation(conversationId, userId);
    return this.ingestFile(conv.id, null, userId, file);
  }

  async createFromUploadInSession(
    conversationId: string,
    sessionId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    await this.getWritableConversation(conversationId, userId);
    return this.ingestFile(conversationId, sessionId, userId, file);
  }

  async getAttachment(
    conversationId: string,
    attachmentId: string,
    userId: string,
  ): Promise<AttachmentDto> {
    await this.getParticipantConversation(conversationId, userId);
    const row = await this.attachmentRepo.findOne({
      where: { id: attachmentId, conversation_id: conversationId },
    });
    if (!row) throw new NotFoundException('Attachment not found');
    return this.toDto(row);
  }

  async linkToMessage(
    messageId: string,
    attachmentIds: string[],
    conversationId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!attachmentIds.length) return;
    const repo = manager
      ? manager.getRepository(StaysMessageAttachment)
      : this.attachmentRepo;
    await repo.update(
      { id: In(attachmentIds), message_id: IsNull() },
      { message_id: messageId },
    );
    if (conversationId) {
      await this.bumpAttachmentVersion(conversationId, manager);
    }
  }

  async loadForMessages(
    messages: Array<{ id: string; metadata?: Record<string, unknown> }>,
  ): Promise<Map<string, AttachmentDto[]>> {
    if (!messages.length) return new Map();

    for (const message of messages) {
      const attachmentIds = (message.metadata?.attachment_ids as string[] | undefined) ?? [];
      if (attachmentIds.length) {
        await this.linkToMessage(message.id, attachmentIds);
      }
    }

    const messageIds = messages.map((m) => m.id);
    const rows = await this.attachmentRepo.find({
      where: { message_id: In(messageIds) },
      order: { created_at: 'ASC' },
    });
    const map = new Map<string, AttachmentDto[]>();
    for (const row of rows) {
      if (!row.message_id) continue;
      const list = map.get(row.message_id) ?? [];
      list.push(this.toDto(row));
      map.set(row.message_id, list);
    }
    return map;
  }

  async assertReadyForSend(
    conversationId: string,
    userId: string,
    attachmentIds: string[],
  ): Promise<StaysMessageAttachment[]> {
    if (!attachmentIds.length) return [];
    const rows = await this.attachmentRepo.find({
      where: {
        id: In(attachmentIds),
        conversation_id: conversationId,
        uploader_user_id: userId,
      },
    });
    if (rows.length !== attachmentIds.length) {
      throw new BadRequestException('Invalid attachment references');
    }
    for (const row of rows) {
      if (row.status !== 'READY') {
        throw new BadRequestException('Attachment not ready');
      }
    }
    return rows;
  }

  async deleteUnlinkedAttachment(row: StaysMessageAttachment): Promise<void> {
    if (row.message_id) return;

    if (row.media_asset_id) {
      const asset = await this.mediaAssetRepo.findOne({
        where: { id: row.media_asset_id },
      });
      if (asset) {
        await this.safeUnlink(asset.storage_key);
        if (asset.thumbnail_storage_key) {
          await this.safeUnlink(asset.thumbnail_storage_key);
        }
        await this.mediaAssetRepo.delete(asset.id);
      }
    } else {
      await this.safeUnlink(row.storage_url);
      if (row.thumbnail_url && row.thumbnail_url !== row.storage_url) {
        await this.safeUnlink(row.thumbnail_url);
      }
    }

    await this.attachmentRepo.delete(row.id);
  }

  resolveStoragePath(storageUrl: string): string {
    return this.mediaAssets.resolveStoragePath(storageUrl);
  }

  toDto(row: StaysMessageAttachment): AttachmentDto {
    const version = row.media_version ?? 1;
    const thumb = row.thumbnail_url
      ? this.media.resolveAttachment(row.id, 'thumb', version)
      : null;
    const full =
      row.status === 'READY'
        ? this.media.resolveAttachment(row.id, 'full', version)
        : null;
    return {
      id: row.id,
      sessionId: row.session_id,
      mediaAssetId: row.media_asset_id,
      processingStatus: row.status,
      status: row.status,
      virusScanStatus: row.virus_scan_status,
      mime: row.mime,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
      width: row.width,
      height: row.height,
      orientation: row.orientation,
      durationMs: row.duration_ms,
      checksum: row.checksum_sha256,
      blurhash: row.blurhash,
      originalFilename: row.original_filename,
      thumbnail: thumb,
      full,
      original: full,
    };
  }

  async bumpAttachmentVersion(
    conversationId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const convRepo = manager
      ? manager.getRepository(StaysConversation)
      : this.convRepo;
    const conv = await convRepo.findOne({ where: { id: conversationId } });
    if (!conv) return 1;
    const next = (conv.attachment_version ?? 1) + 1;
    await convRepo.update(conversationId, { attachment_version: next });
    return next;
  }

  private async ingestFile(
    conversationId: string,
    sessionId: string | null,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large');

    const declaredMime = (file.mimetype || '').toLowerCase();
    if (declaredMime && !ALLOWED_DECLARED_MIMES.has(declaredMime)) {
      throw new BadRequestException('Unsupported file type');
    }

    const row = this.attachmentRepo.create({
      conversation_id: conversationId,
      session_id: sessionId,
      uploader_user_id: userId,
      message_id: null,
      status: 'UPLOADING',
      storage_url: '',
      thumbnail_url: null,
      original_filename: file.originalname || 'upload',
      mime: declaredMime || null,
      virus_scan_status: 'PENDING',
    });
    const pending = await this.attachmentRepo.save(row);

    try {
      await this.attachmentRepo.update(pending.id, { status: 'PROCESSING' });

      const processed = await this.mediaAssets.processAndStore({
        buffer: file.buffer,
        declaredMime,
        conversationId,
      });

      const isImage = isImageMime(processed.mime);
      const virusStatus = isImage ? 'SAFE' : 'PENDING';

      await this.attachmentRepo.update(pending.id, {
        media_asset_id: processed.asset.id,
        storage_url: processed.storageKey,
        thumbnail_url: processed.thumbnailKey ?? (isImage ? processed.storageKey : null),
        mime: processed.mime,
        width: processed.width,
        height: processed.height,
        checksum_sha256: processed.checksum,
        size_bytes: String(file.size),
        status: 'READY',
        virus_scan_status: virusStatus,
        media_version: 1,
      });

      const saved = await this.attachmentRepo.findOneOrFail({
        where: { id: pending.id },
      });
      return this.toDto(saved);
    } catch (err) {
      await this.attachmentRepo.update(pending.id, { status: 'FAILED' });
      const message = err instanceof Error ? err.message : 'Upload failed';
      throw new BadRequestException(message);
    }
  }

  private async safeUnlink(storageKey: string): Promise<void> {
    try {
      const path = this.resolveStoragePath(storageKey);
      await unlink(path);
    } catch {
      // ignore missing files
    }
  }

  private async getWritableConversation(
    conversationId: string,
    userId: string,
  ): Promise<StaysConversation> {
    const conv = await this.getParticipantConversation(conversationId, userId);
    const perms = this.permissions.resolve(conv, userId);
    if (!perms.canUpload) throw new ForbiddenException('Upload not allowed');
    return conv;
  }

  private async getParticipantConversation(
    conversationId: string,
    userId: string,
  ): Promise<StaysConversation> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    return conv;
  }
}
