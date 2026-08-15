import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { SupportAgentSkillsService } from './support-agent-skills.service';
import { SupportAgentMetricsService } from './support-agent-metrics.service';
import { SupportPerformanceService } from './support-performance.service';
import { SupportCoachingNotesService } from './support-coaching-notes.service';
import { staffActorFromUser } from './support-staff-access';
import {
  AdminListTicketsQueryDto,
  AdminListSupportReviewsQueryDto,
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
  PutSupportAgentSkillsDto,
  ReopenSupportTicketDto,
  RenderCannedReplyDto,
  HeartbeatPresenceDto,
  SendSupportTicketMessageDto,
  TRUST_REPORT_KINDS,
} from './dto/support-ticket.dto';
import { AdminSupportAnalyticsQueryDto, AdminSupportAttentionQueryDto, AdminSupportPerformanceQueryDto, CreateCoachingNoteDto, PatchCoachingNoteDto } from './dto/support-analytics.dto';
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
    private readonly agentSkills: SupportAgentSkillsService,
    private readonly agentMetrics: SupportAgentMetricsService,
    private readonly performance: SupportPerformanceService,
    private readonly coaching: SupportCoachingNotesService,
  ) {}

  @Get('support/analytics')
  supportAnalytics(@Query() query: AdminSupportAnalyticsQueryDto) {
    return this.supportTickets.getAnalyticsForAdmin(query);
  }

  @Get('support/operations/overview')
  operationsOverview() {
    return this.ops.getOperationsOverview();
  }

  @Get('support/operations/attention')
  operationsAttention(@Query() query: AdminSupportAttentionQueryDto) {
    return this.ops.listAttention(query);
  }

  @Get('support/operations/performance')
  async operationsPerformance(@Query() query: AdminSupportPerformanceQueryDto) {
    const window = this.performance.parseWindow(query);
    const [agents, categories, languages, canned, signals] = await Promise.all([
      this.performance.listAgentPerformance(window),
      this.performance.categoryBreakdown(window),
      this.performance.languageBreakdown(window),
      this.performance.cannedEffectiveness(window),
      this.ops.listActivePatternSignals(),
    ]);
    const categoryFilter = query.category;
    const languageFilter = query.language;
    return {
      ...this.performance.freshnessLive(window),
      agents,
      categories: categoryFilter
        ? categories.filter((row) => row.category === categoryFilter)
        : categories,
      languages: languageFilter
        ? languages.filter((row) => row.language === languageFilter)
        : languages,
      cannedReplies: canned,
      signals,
    };
  }

  @Get('support/agents/workload')
  agentWorkload() {
    return this.ops.listAgentWorkload();
  }

  @Get('support/agents/metrics')
  listAgentMetrics(@Query() query: AdminSupportAnalyticsQueryDto) {
    return this.agentMetrics.listForAdmin(query);
  }

  @Get('support/me/metrics')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  myMetrics(
    @CurrentUser() user: { userId: string },
    @Query() query: AdminSupportAnalyticsQueryDto,
  ) {
    return this.agentMetrics.forAgent(user.userId, query);
  }

  @Get('support/me/performance')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  async myPerformance(
    @CurrentUser() user: { userId: string },
    @Query() query: AdminSupportPerformanceQueryDto,
  ) {
    const window = this.performance.parseWindow(query);
    const metrics = await this.performance.forAgent(user.userId, window);
    return {
      ...this.performance.freshnessLive(window),
      agentId: user.userId,
      metrics,
    };
  }

  @Get('support/agents/:id/performance')
  async agentPerformance(
    @Param('id') id: string,
    @Query() query: AdminSupportPerformanceQueryDto,
  ) {
    const window = this.performance.parseWindow(query);
    const [metrics, trend, categories, feedback, signals] = await Promise.all([
      this.performance.forAgent(id, window),
      this.performance.agentTrend(id, window),
      this.performance.categoryBreakdown(window, id),
      this.performance.recentFeedback(id, window),
      this.ops.listActivePatternSignals(id),
    ]);
    return {
      ...this.performance.freshnessLive(window),
      agentId: id,
      metrics,
      trend,
      categories,
      feedback,
      signals,
    };
  }

  @Get('support/agents/:id/coaching-notes')
  listCoachingNotes(@Param('id') id: string) {
    return this.coaching.listForAgent(id);
  }

  @Post('support/agents/:id/coaching-notes')
  createCoachingNote(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: CreateCoachingNoteDto,
  ) {
    return this.coaching.create(id, user.userId, body);
  }

  @Patch('support/coaching-notes/:noteId')
  patchCoachingNote(
    @CurrentUser() user: { userId: string },
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() body: PatchCoachingNoteDto,
  ) {
    return this.coaching.patch(noteId, user.userId, body);
  }

  @Get('support/agents/:id/skills')
  getAgentSkills(@Param('id') id: string) {
    return this.agentSkills.getForAgent(id);
  }

  @Put('support/agents/:id/skills')
  putAgentSkills(
    @Param('id') id: string,
    @Body() body: PutSupportAgentSkillsDto,
  ) {
    return this.agentSkills.putForAgent(id, body);
  }

  @Get('support/signals')
  listSignals(@Query() query: AdminListSignalsQueryDto) {
    return this.ops.listSignals(query);
  }

  @Patch('support/signals/:id')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  patchSignal(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchOperationalSignalDto,
  ) {
    const actor = staffActorFromUser(user);
    return this.ops.patchSignal(id, body.status, user.userId, actor);
  }

  @Get('support/tickets')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  listTickets(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Query() query: AdminListTicketsQueryDto,
  ) {
    return this.supportTickets.listForAdmin(query, staffActorFromUser(user));
  }

  @Get('support/reviews')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  listSupportReviews(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Query() query: AdminListSupportReviewsQueryDto,
  ) {
    return this.supportTickets.listSupportReviewsForAdmin(
      query,
      staffActorFromUser(user),
    );
  }

  @Get('support/canned-replies')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  listCannedReplies(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Query() query: ListCannedRepliesQueryDto,
  ) {
    const actor = staffActorFromUser(user);
    return this.cannedReplies.list(
      actor.role === 'ADMIN' && query.includeInactive === true,
    );
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

  @Post('support/canned-replies/:id/render')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  renderCannedReply(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenderCannedReplyDto,
  ) {
    return this.supportTickets.renderCannedReplyForAdmin(
      id,
      body.ticketId,
      user.userId,
      staffActorFromUser(user),
    );
  }

  @Get('support/tickets/open-count')
  countOpenTickets() {
    return this.supportTickets.countOpenTicketsForAdmin().then((total) => ({
      total,
    }));
  }

  @Get('support/tickets/:id')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  getTicket(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportTickets.getForAdmin(id, staffActorFromUser(user));
  }

  @Get('support/tickets/:id/signals')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  ticketSignals(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ops.listSignalsForTicket(id, false, staffActorFromUser(user));
  }

  @Get('support/tickets/:id/related')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  relatedTickets(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ops
      .findRelatedTickets(id, staffActorFromUser(user))
      .then((items) => ({ items }));
  }

  @Patch('support/tickets/:id')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  patchTicket(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchSupportTicketDto,
  ) {
    const actor = staffActorFromUser(user);
    return this.supportTickets.patchForAdmin(id, body, user.userId, actor);
  }

  @Post('support/tickets/:id/reopen')
  reopenTicket(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReopenSupportTicketDto,
  ) {
    return this.supportTickets.reopenForAdmin(
      id,
      user.userId,
      body.reason ?? 'CUSTOMER_UNRESOLVED',
      staffActorFromUser(user),
    );
  }

  @Put('support/tickets/:id/presence')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  heartbeatPresence(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HeartbeatPresenceDto = {},
  ) {
    return this.supportTickets.heartbeatPresence(
      id,
      user.userId,
      staffActorFromUser(user),
      body.handling === true,
    );
  }

  @Get('support/tickets/:id/messages')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  listMessages(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportTickets.listMessagesForAdmin(
      id,
      staffActorFromUser(user),
    );
  }

  @Post('support/tickets/:id/messages')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  sendMessage(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendSupportTicketMessageDto,
  ) {
    return this.supportTickets.sendAdminMessage(
      id,
      user.userId,
      body.body,
      staffActorFromUser(user),
    );
  }

  @Get('support/tickets/:id/notes')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  listNotes(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSupportTicketNotesQueryDto,
  ) {
    return this.supportTickets.listNotesForAdmin(
      id,
      query.limit,
      staffActorFromUser(user),
    );
  }

  @Post('support/tickets/:id/notes')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  createNote(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSupportTicketNoteDto,
  ) {
    return this.supportTickets.createNoteForAdmin(
      id,
      user.userId,
      body.body,
      staffActorFromUser(user),
    );
  }

  @Get('support/tickets/:id/activity')
  @Roles('ADMIN', 'SUPPORT_AGENT')
  ticketActivity(
    @CurrentUser() user: { userId: string; role?: string; roles?: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.supportTickets.listTicketActivity(
      id,
      query.limit,
      query.offset,
      staffActorFromUser(user),
    );
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
