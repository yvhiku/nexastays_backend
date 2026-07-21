import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { ReportConversationDto } from './dto/report-conversation.dto';

interface AuthRequest {
  user: { sub: string };
}

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations for current user' })
  list(
    @Req() req: AuthRequest,
    @Query('filter') filter?: string,
    @Query('q') q?: string,
  ) {
    return this.conversations.listConversations(req.user.sub, filter ?? 'all', q);
  }

  @Get('conversations/unread-count')
  @ApiOperation({ summary: 'Unread conversation count' })
  unreadCount(@Req() req: AuthRequest) {
    return this.conversations.getUnreadCount(req.user.sub).then((count) => ({ count }));
  }

  @Get('conversations/by-booking/:bookingId')
  @ApiOperation({ summary: 'Find conversation for a booking' })
  byBooking(
    @Req() req: AuthRequest,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.conversations.getConversationByBooking(bookingId, req.user.sub);
  }

  @Post('conversations/ensure-for-booking/:bookingId')
  @ApiOperation({
    summary: 'Ensure inbox thread exists for a confirmed booking (backfill)',
  })
  ensureForBooking(
    @Req() req: AuthRequest,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.conversations.ensureConversationForBooking(
      bookingId,
      req.user.sub,
    );
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  getOne(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before_sequence') beforeSequence?: string,
  ) {
    const seq = beforeSequence ? Number(beforeSequence) : undefined;
    return this.conversations.getConversation(id, req.user.sub, seq);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'List messages (cursor pagination)' })
  listMessages(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('before_sequence') beforeSequence?: string,
  ) {
    return this.messages.listMessages(
      id,
      req.user.sub,
      limit ? Number(limit) : 30,
      beforeSequence ? Number(beforeSequence) : undefined,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a text message' })
  send(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendText(id, req.user.sub, dto.body, dto.client_message_id);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  markRead(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.markRead(id, req.user.sub);
  }

  @Patch('conversations/:id/visibility')
  @ApiOperation({ summary: 'Archive, delete, or restore conversation for caller' })
  visibility(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    return this.conversations.updateVisibility(id, req.user.sub, dto.action);
  }

  @Post('conversations/:id/report')
  report(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportConversationDto,
  ) {
    return this.conversations.report(id, req.user.sub, dto.reason).then(() => ({ ok: true }));
  }

  @Post('conversations/:id/block')
  block(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.block(id, req.user.sub).then(() => ({ ok: true }));
  }

  @Post('conversations/:id/safety')
  safety(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.safety(id, req.user.sub);
  }
}
