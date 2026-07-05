import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApplyReferralDto } from './dto/apply-referral.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('Referrals')
@Controller(['referrals', 'pay/referrals'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('code')
  getCode(@CurrentUser() user: { userId: string }) {
    return this.referralsService.getCode(user.userId);
  }

  @Post('apply')
  apply(
    @CurrentUser() user: { userId: string },
    @Body() body: ApplyReferralDto,
  ) {
    return this.referralsService.apply(user.userId, body.referralCode);
  }

  @Get('history')
  getHistory(@CurrentUser() user: { userId: string }) {
    return this.referralsService.getHistory(user.userId);
  }
}
