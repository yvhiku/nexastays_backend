import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { WaitlistService } from '../../waitlist/waitlist.service';
import { AdminWaitlistQueryDto } from '../../waitlist/dto/admin-waitlist-query.dto';

@ApiTags('Pay Admin')
@Controller(['admin/waitlist', 'pay/admin/waitlist'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('ADMIN')
export class AdminWaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  getWaitlist(@Query() query: AdminWaitlistQueryDto) {
    return this.waitlistService.findAllForAdmin(query);
  }
}
