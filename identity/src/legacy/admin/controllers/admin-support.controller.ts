import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { AdminSupportService } from '../services/admin-support.service';
import {
  AdminSupportTicketsQueryDto,
  AdminSupportRefundsQueryDto,
} from '../dto/admin-support-query.dto';

@ApiTags('Pay Admin')
@Controller(['admin/support', 'pay/admin/support'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('ADMIN')
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get('tickets')
  getTickets(@Query() query: AdminSupportTicketsQueryDto) {
    return this.adminSupportService.getTickets(query);
  }

  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.adminSupportService.getTicket(id);
  }

  @Get('refunds')
  getRefunds(@Query() query: AdminSupportRefundsQueryDto) {
    return this.adminSupportService.getRefunds(query);
  }

  @Get('refunds/:id')
  getRefund(@Param('id') id: string) {
    return this.adminSupportService.getRefund(id);
  }
}
