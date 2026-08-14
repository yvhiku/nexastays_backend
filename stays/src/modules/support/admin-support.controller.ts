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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportTicketsService } from './support-tickets.service';
import { SupportCannedRepliesService } from './support-canned-replies.service';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import {
  AdminListTicketsQueryDto,
  AdminListReportsQueryDto,
  CreateCannedReplyDto,
  CreateSupportTicketNoteDto,
  InvestigationConversationQueryDto,
  ListActivityQueryDto,
  ListCannedRepliesQueryDto,
  ListSupportTicketNotesQueryDto,
  PatchCannedReplyDto,
  PatchSupportTicketDto,
  PatchTrustReportDto,
  SendSupportTicketMessageDto,
  TRUST_REPORT_KINDS,
} from './dto/support-ticket.dto';
import { AdminSupportAnalyticsQueryDto } from './dto/support-analytics.dto';
import {
  AdminListSignalsQueryDto,
  PatchOperationalSignalDto,
} from './dto/operational-signals.dto';
import { IsIn, IsString } from 'class-validator';

class GetTrustReportQueryDto {
  @IsString()
  @IsIn([...TRUST_REPORT_KINDS])
  kind!: (typeof TRUST_REPORT_KINDS)[number];
}

class ReportActivityQueryDto extends ListActivityQueryDto {
  @IsString()
  @IsIn([...TRUST_REPORT_KINDS])
  kind!: (typeof TRUST_REPORT_KINDS)[number];
}

@ApiTags('Stays Admin Support')
@Controller('admin/stays')
@Throttle({
  short: { limit: 30, ttl: 1000 },
  default: { limit: 300, ttl: 60000 },
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminSupportController {
  constructor(
    private readonly supportTickets: SupportTicketsService,
    private readonly cannedReplies: SupportCannedRepliesService,
    private readonly ops: OperationalIntelligenceService,
  ) {}

  @Get('support/analytics')
  supportAnalytics(@Query() query: AdminSupportAnalyticsQueryDto) {
    return this.supportTickets.getAnalyticsForAdmin(query);
  }

  @Get('support/operations/overview')
  operationsOverview() {
    return this.ops.getOperationsOverview();
  }

  @Get('support/signals')
  listSignals(@Query() query: AdminListSignalsQueryDto) {
    return this.ops.listSignals(query);
  }

  @Patch('support/signals/:id')
  patchSignal(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchOperationalSignalDto,
  ) {
    return this.ops.patchSignal(id, body.status, user.userId);
  }

  @Get('support/tickets')
  listTickets(@Query() query: AdminListTicketsQueryDto) {
    return this.supportTickets.listForAdmin(query);
  }

  @Get('support/canned-replies')
  listCannedReplies(@Query() query: ListCannedRepliesQueryDto) {
    return this.cannedReplies.list(query.includeInactive === true);
  }

  @Post('support/canned-replies')
  createCannedReply(
    @CurrentUser() user: { userId: string },
    @Body() body: CreateCannedReplyDto,
  ) {
    return this.cannedReplies.create(user.userId, body);
  }

  @Patch('support/canned-replies/:id')
  patchCannedReply(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchCannedReplyDto,
  ) {
    return this.cannedReplies.patch(id, user.userId, body);
  }

  @Delete('support/canned-replies/:id')
  deactivateCannedReply(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cannedReplies.deactivate(id, user.userId);
  }

  @Get('support/tickets/open-count')
  countOpenTickets() {
    return this.supportTickets.countOpenTicketsForAdmin().then((total) => ({
      total,
    }));
  }

  @Get('support/tickets/:id')
  getTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportTickets.getForAdmin(id);
  }

  @Get('support/tickets/:id/signals')
  ticketSignals(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.listSignalsForTicket(id);
  }

  @Get('support/tickets/:id/related')
  relatedTickets(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.findRelatedTickets(id).then((items) => ({ items }));
  }

  @Patch('support/tickets/:id')
  patchTicket(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchSupportTicketDto,
  ) {
    return this.supportTickets.patchForAdmin(id, body, user.userId);
  }

  @Get('support/tickets/:id/messages')
  listMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportTickets.listMessagesForAdmin(id);
  }

  @Post('support/tickets/:id/messages')
  sendMessage(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendSupportTicketMessageDto,
  ) {
    return this.supportTickets.sendAdminMessage(id, user.userId, body.body);
  }

  @Get('support/tickets/:id/notes')
  listNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSupportTicketNotesQueryDto,
  ) {
    return this.supportTickets.listNotesForAdmin(id, query.limit);
  }

  @Post('support/tickets/:id/notes')
  createNote(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSupportTicketNoteDto,
  ) {
    return this.supportTickets.createNoteForAdmin(id, user.userId, body.body);
  }

  @Get('support/tickets/:id/activity')
  ticketActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.supportTickets.listTicketActivity(id, query.limit, query.offset);
  }

  @Get('reports')
  listReports(@Query() query: AdminListReportsQueryDto) {
    return this.supportTickets.listReportsForAdmin(query);
  }

  @Get('reports/:id/conversation')
  investigationConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InvestigationConversationQueryDto,
  ) {
    return this.supportTickets.getInvestigationConversation(
      id,
      query.kind,
      query.limit,
      query.before_sequence,
    );
  }

  @Get('reports/:id/activity')
  reportActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReportActivityQueryDto,
  ) {
    return this.supportTickets.listReportActivity(
      id,
      query.kind,
      query.limit,
      query.offset,
    );
  }

  @Get('reports/:id')
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetTrustReportQueryDto,
  ) {
    return this.supportTickets.getReportForAdmin(id, query.kind);
  }

  @Patch('reports/:id')
  patchReport(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchTrustReportDto,
  ) {
    return this.supportTickets.patchReportForAdmin(id, body, user.userId);
  }
}
