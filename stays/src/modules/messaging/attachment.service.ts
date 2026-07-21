import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { Repository, In } from 'typeorm';
import { StaysMessageAttachment } from './entities/stays-message-attachment.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagingMediaService } from './messaging-media.service';
import type { AttachmentDto } from './messaging.types';

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const FILE_MIMES = new Set([...IMAGE_MIMES, 'application/pdf']);

@Injectable()
export class AttachmentService {
  private readonly uploadRoot =
    process.env.MEDIA_STORAGE_ROOT?.trim() || 'uploads';

  constructor(
    @InjectRepository(StaysMessageAttachment)
    private readonly attachmentRepo: Repository<StaysMessageAttachment>,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    private readonly permissions: MessagingPermissionsService,
    private readonly media: MessagingMediaService,
  ) {}

  async createFromUpload(
    conversationId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    const conv = await this.getWritableConversation(conversationId, userId);
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large');

    const mime = file.mimetype || 'application/octet-stream';
    if (!FILE_MIMES.has(mime)) {
      throw new BadRequestException('Unsupported file type');
    }

    const ext = extname(file.originalname || '') || (IMAGE_MIMES.has(mime) ? '.jpg' : '.bin');
    const assetId = randomUUID();
    const relDir = join('messaging', conversationId);
    const absDir = join(this.uploadRoot, relDir);
    await mkdir(absDir, { recursive: true });

    const filename = `${assetId}${ext}`;
    const absPath = join(absDir, filename);
    await writeFile(absPath, file.buffer);

    const storageUrl = join(relDir, filename).replace(/\\/g, '/');
    const isImage = IMAGE_MIMES.has(mime);

    const row = this.attachmentRepo.create({
      conversation_id: conv.id,
      uploader_user_id: userId,
      message_id: null,
      status: 'PROCESSING',
      storage_url: storageUrl,
      thumbnail_url: isImage ? storageUrl : null,
      original_filename: file.originalname || filename,
      mime,
      size_bytes: String(file.size),
      virus_scan_status: 'CLEAN',
    });

    row.status = 'READY';
    const saved = await this.attachmentRepo.save(row);
    return this.toDto(saved);
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

  async linkToMessage(messageId: string, attachmentIds: string[]): Promise<void> {
    if (!attachmentIds.length) return;
    await this.attachmentRepo.update(
      { id: In(attachmentIds), message_id: null as unknown as string },
      { message_id: messageId },
    );
  }

  async loadForMessages(messageIds: string[]): Promise<Map<string, AttachmentDto[]>> {
    if (!messageIds.length) return new Map();
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

  resolveStoragePath(storageUrl: string): string {
    return join(this.uploadRoot, storageUrl);
  }

  private toDto(row: StaysMessageAttachment): AttachmentDto {
    const version = 1;
    const thumb = row.thumbnail_url
      ? this.media.resolveAttachment(row.id, 'thumb', version)
      : null;
    const full =
      row.status === 'READY'
        ? this.media.resolveAttachment(row.id, 'full', version)
        : null;
    return {
      id: row.id,
      status: row.status,
      mime: row.mime,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
      width: row.width,
      height: row.height,
      blurhash: row.blurhash,
      originalFilename: row.original_filename,
      thumbnail: thumb,
      full,
    };
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
