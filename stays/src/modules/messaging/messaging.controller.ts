import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { ReportConversationDto } from './dto/report-conversation.dto';

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

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a text message' })
  send(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.sendText(id, user.userId, dto.body, dto.client_message_id);
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
