import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto, CreateSupportTicketCsatDto } from './dto/support-ticket.dto';

@ApiTags('Support')
@Controller('support')
@Throttle({
  short: { limit: 10, ttl: 1000 },
  default: { limit: 60, ttl: 60000 },
})
@ApiBearerAuth()
export class SupportTicketsController {
  constructor(private readonly supportTickets: SupportTicketsService) {}

  @Post('tickets')
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportTickets.createTicketForUser(user.userId, dto);
  }

  @Get('tickets')
  list(
    @CurrentUser() user: { userId: string },
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : 50;
    return this.supportTickets.listForUser(
      user.userId,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Get('tickets/:id')
  get(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportTickets.getForUser(user.userId, id);
  }

  @Get('tickets/:id/csat')
  getCsat(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportTickets.getCsatForUser(user.userId, id);
  }

  @Post('tickets/:id/csat')
  submitCsat(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSupportTicketCsatDto,
  ) {
    return this.supportTickets.submitCsatForUser(user.userId, id, body);
  }
}
