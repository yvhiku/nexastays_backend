import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportTicketsService } from './support-tickets.service';
import {
  PatchSupportTicketDto,
  SendSupportTicketMessageDto,
} from './dto/support-ticket.dto';

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
  constructor(private readonly supportTickets: SupportTicketsService) {}

  @Get('support/tickets')
  listTickets(
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    return this.supportTickets.listForAdmin(limit);
  }

  @Get('support/tickets/:id')
  getTicket(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportTickets.getForAdmin(id);
  }

  @Patch('support/tickets/:id')
  patchTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchSupportTicketDto,
  ) {
    return this.supportTickets.patchForAdmin(id, body);
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

  @Get('reports')
  listReports(
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    return this.supportTickets.listReportsForAdmin(limit);
  }
}
