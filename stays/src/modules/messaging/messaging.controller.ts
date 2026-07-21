import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { multerLimits } from '../../common/security/multer-limits';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { AttachmentService } from './attachment.service';
import { AttachmentSessionService } from './attachment-session.service';
import { MessageSearchService } from './message-search.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { ReportConversationDto } from './dto/report-conversation.dto';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly attachments: AttachmentService,
    private readonly attachmentSessions: AttachmentSessionService,
    private readonly search: MessageSearchService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations for current user' })
  list(
    @CurrentUser() user: { userId: string },
    @Query('filter') filter?: string,
    @Query('q') q?: string,
  ) {
    return this.conversations.listConversations(user.userId, filter ?? 'all', q);
  }

  @Get('conversations/unread-count')
  @ApiOperation({ summary: 'Unread conversation count' })
  unreadCount(@CurrentUser() user: { userId: string }) {
    return this.conversations.getUnreadCount(user.userId).then((count) => ({ count }));
  }

  @Get('conversations/by-booking/:bookingId')
  @ApiOperation({ summary: 'Find conversation for a booking' })
  byBooking(
    @CurrentUser() user: { userId: string },
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.conversations.getConversationByBooking(bookingId, user.userId);
  }

  @Post('conversations/ensure-for-booking/:bookingId')
  @ApiOperation({
    summary: 'Ensure inbox thread exists for a confirmed booking (backfill)',
  })
  ensureForBooking(
    @CurrentUser() user: { userId: string },
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.conversations.ensureConversationForBooking(
      bookingId,
      user.userId,
    );
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  getOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before_sequence') beforeSequence?: string,
  ) {
    const seq = beforeSequence ? Number(beforeSequence) : undefined;
    return this.conversations.getConversation(id, user.userId, seq);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'List messages (cursor pagination)' })
  listMessages(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('before_sequence') beforeSequence?: string,
  ) {
    return this.messages.listMessages(
      id,
      user.userId,
      limit ? Number(limit) : 30,
      beforeSequence ? Number(beforeSequence) : undefined,
    );
  }

  @Get('conversations/:id/search')
  @ApiOperation({ summary: 'Search messages, files, photos, links, and cards' })
  searchConversation(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q?: string,
    @Query('types') types?: string,
  ) {
    const parsedTypes = types
      ? (types.split(',').filter(Boolean) as Array<'message' | 'file' | 'photo' | 'link' | 'card'>)
      : undefined;
    return this.search.search(id, user.userId, q ?? '', parsedTypes);
  }

  @Post('conversations/:id/attachment-sessions')
  @ApiOperation({ summary: 'Create attachment upload session' })
  createAttachmentSession(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attachmentSessions.createSession(id, user.userId);
  }

  @Get('attachment-sessions/:sessionId')
  @ApiOperation({ summary: 'Get attachment session with uploads' })
  getAttachmentSession(
    @CurrentUser() user: { userId: string },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.attachmentSessions.getSession(sessionId, user.userId);
  }

  @Post('attachment-sessions/:sessionId/attachments')
  @ApiOperation({ summary: 'Upload file into attachment session' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: multerLimits(MAX_ATTACHMENT_BYTES),
    }),
  )
  uploadToAttachmentSession(
    @CurrentUser() user: { userId: string },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachmentSessions.uploadToSession(sessionId, user.userId, file);
  }

  @Post('attachment-sessions/:sessionId/complete')
  @ApiOperation({ summary: 'Mark session ready after all uploads succeed' })
  completeAttachmentSession(
    @CurrentUser() user: { userId: string },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.attachmentSessions.completeSession(sessionId, user.userId);
  }

  @Delete('attachment-sessions/:sessionId/attachments/:attachmentId')
  @ApiOperation({ summary: 'Remove attachment from session before send' })
  deleteSessionAttachment(
    @CurrentUser() user: { userId: string },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachmentSessions
      .deleteAttachmentFromSession(sessionId, attachmentId, user.userId)
      .then(() => ({ ok: true }));
  }

  @Delete('attachment-sessions/:sessionId')
  @ApiOperation({ summary: 'Abandon attachment session and delete staged uploads' })
  abandonAttachmentSession(
    @CurrentUser() user: { userId: string },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.attachmentSessions.abandonSession(sessionId, user.userId).then(() => ({ ok: true }));
  }

  @Post('conversations/:id/attachments')
  @ApiOperation({ summary: 'Upload attachment (legacy — prefer attachment sessions)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: multerLimits(MAX_ATTACHMENT_BYTES),
    }),
  )
  uploadAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.createFromUpload(id, user.userId, file);
  }

  @Get('conversations/:id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Get attachment status and signed URLs' })
  getAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.getAttachment(id, attachmentId, user.userId);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message (text or with attachment references)' })
  send(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    if (dto.body && !dto.type && !dto.attachment_ids?.length) {
      return this.messages.sendText(id, user.userId, dto.body, dto.client_message_id);
    }
    return this.messages.sendMessage(id, user.userId, dto);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  markRead(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messages.markRead(id, user.userId);
  }

  @Patch('conversations/:id/visibility')
  @ApiOperation({ summary: 'Archive, delete, or restore conversation for caller' })
  visibility(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    return this.conversations.updateVisibility(id, user.userId, dto.action);
  }

  @Post('conversations/:id/report')
  report(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportConversationDto,
  ) {
    return this.conversations.report(id, user.userId, dto.reason).then(() => ({ ok: true }));
  }

  @Post('conversations/:id/block')
  block(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.block(id, user.userId).then(() => ({ ok: true }));
  }

  @Post('conversations/:id/safety')
  safety(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.safety(id, user.userId);
  }
}
