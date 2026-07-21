import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, LessThan } from 'typeorm';
import { StaysAttachmentSession } from './entities/stays-attachment-session.entity';
import { StaysMessageAttachment } from './entities/stays-message-attachment.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingPermissionsService } from './permissions.service';
import { AttachmentService } from './attachment.service';
import type { AttachmentSessionDto } from './messaging.types';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AttachmentSessionService {
  constructor(
    @InjectRepository(StaysAttachmentSession)
    private readonly sessionRepo: Repository<StaysAttachmentSession>,
    @InjectRepository(StaysMessageAttachment)
    private readonly attachmentRepo: Repository<StaysMessageAttachment>,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    private readonly permissions: MessagingPermissionsService,
    private readonly attachments: AttachmentService,
  ) {}

  async createSession(
    conversationId: string,
    userId: string,
  ): Promise<AttachmentSessionDto> {
    const conv = await this.getWritableConversation(conversationId, userId);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = this.sessionRepo.create({
      conversation_id: conv.id,
      owner_user_id: userId,
      status: 'CREATED',
      expires_at: expiresAt,
    });
    const saved = await this.sessionRepo.save(session);
    return this.toDto(saved, []);
  }

  async getSession(
    sessionId: string,
    userId: string,
  ): Promise<AttachmentSessionDto> {
    const session = await this.getOwnedSession(sessionId, userId);
    const items = await this.attachmentRepo.find({
      where: { session_id: session.id },
      order: { created_at: 'ASC' },
    });
    return this.toDto(
      session,
      items.map((row) => this.attachments.toDto(row)),
    );
  }

  async uploadToSession(
    sessionId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const session = await this.getOwnedSession(sessionId, userId);
    if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
      throw new BadRequestException('Session is closed');
    }
    if (session.expires_at.getTime() < Date.now()) {
      await this.sessionRepo.update(session.id, { status: 'ABANDONED' });
      throw new BadRequestException('Session expired');
    }

    if (session.status === 'CREATED') {
      await this.sessionRepo.update(session.id, { status: 'UPLOADING' });
    }

    const dto = await this.attachments.createFromUploadInSession(
      session.conversation_id,
      session.id,
      userId,
      file,
    );

    return dto;
  }

  async completeSession(
    sessionId: string,
    userId: string,
  ): Promise<AttachmentSessionDto> {
    const session = await this.getOwnedSession(sessionId, userId);
    if (session.status === 'COMPLETED') {
      return this.getSession(sessionId, userId);
    }
    if (session.status === 'ABANDONED') {
      throw new BadRequestException('Session abandoned');
    }

    const items = await this.attachmentRepo.find({
      where: { session_id: session.id },
    });
    if (!items.length) {
      throw new BadRequestException('No attachments in session');
    }

    const notReady = items.filter((a) => a.status !== 'READY');
    if (notReady.length) {
      throw new BadRequestException('Not all attachments are ready');
    }

    await this.sessionRepo.update(session.id, { status: 'READY' });
    const refreshed = await this.sessionRepo.findOneOrFail({
      where: { id: session.id },
    });
    return this.toDto(
      refreshed,
      items.map((row) => this.attachments.toDto(row)),
    );
  }

  async deleteAttachmentFromSession(
    sessionId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    const session = await this.getOwnedSession(sessionId, userId);
    if (session.status === 'COMPLETED') {
      throw new BadRequestException('Session is finalized');
    }

    const row = await this.attachmentRepo.findOne({
      where: {
        id: attachmentId,
        session_id: session.id,
        uploader_user_id: userId,
        message_id: IsNull(),
      },
    });
    if (!row) throw new NotFoundException('Attachment not found');

    await this.attachments.deleteUnlinkedAttachment(row);
  }

  async abandonSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.getOwnedSession(sessionId, userId);
    if (session.status === 'COMPLETED') {
      throw new BadRequestException('Session is finalized');
    }

    const items = await this.attachmentRepo.find({
      where: { session_id: session.id, message_id: IsNull() },
    });
    for (const row of items) {
      await this.attachments.deleteUnlinkedAttachment(row);
    }
    await this.sessionRepo.update(session.id, { status: 'ABANDONED' });
  }

  async assertSessionReadyForSend(
    conversationId: string,
    userId: string,
    sessionId: string,
  ): Promise<{ session: StaysAttachmentSession; attachments: StaysMessageAttachment[] }> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, conversation_id: conversationId, owner_user_id: userId },
    });
    if (!session) throw new BadRequestException('Invalid session');
    if (session.status !== 'READY') {
      throw new BadRequestException('Session not ready — call complete first');
    }
    if (session.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Session expired');
    }

    const attachments = await this.attachmentRepo.find({
      where: { session_id: session.id, message_id: IsNull() },
      order: { created_at: 'ASC' },
    });
    if (!attachments.length) {
      throw new BadRequestException('Session has no attachments');
    }
    for (const row of attachments) {
      if (row.status !== 'READY') {
        throw new BadRequestException('Attachment not ready');
      }
    }
    return { session, attachments };
  }

  async finalizeSession(sessionId: string): Promise<void> {
    await this.sessionRepo.update(sessionId, { status: 'COMPLETED' });
  }

  async markExpiredSessionsAbandoned(): Promise<number> {
    const now = new Date();
    const expired = await this.sessionRepo.find({
      where: {
        status: In(['CREATED', 'UPLOADING', 'READY']),
        expires_at: LessThan(now),
      },
    });
    for (const session of expired) {
      await this.abandonSessionInternal(session.id);
    }
    return expired.length;
  }

  private async abandonSessionInternal(sessionId: string): Promise<void> {
    const items = await this.attachmentRepo.find({
      where: { session_id: sessionId, message_id: IsNull() },
    });
    for (const row of items) {
      await this.attachments.deleteUnlinkedAttachment(row);
    }
    await this.sessionRepo.update(sessionId, { status: 'ABANDONED' });
  }

  private toDto(
    session: StaysAttachmentSession,
    attachments: AttachmentSessionDto['attachments'],
  ): AttachmentSessionDto {
    return {
      id: session.id,
      conversationId: session.conversation_id,
      status: session.status,
      expiresAt: session.expires_at.toISOString(),
      attachments,
    };
  }

  private async getOwnedSession(
    sessionId: string,
    userId: string,
  ): Promise<StaysAttachmentSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.owner_user_id !== userId) {
      throw new NotFoundException('Session not found');
    }
    await this.getParticipantConversation(session.conversation_id, userId);
    return session;
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
