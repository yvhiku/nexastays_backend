import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';
import { OnboardMerchantDto } from './dto/onboard-merchant.dto';

@ApiTags('Go Deliveries')
@Controller('go/delivery/merchants')
@UseGuards(JwtAuthGuard)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  /**
   * List all active merchants (Consumer)
   * GET /go/delivery/merchants
   */
  @Get()
  @UseGuards(AccountTypeGuard)
  @AccountTypes('CONSUMER', 'ADMIN')
  async listActiveMerchants() {
    return this.merchantsService.listActiveMerchants();
  }

  /**
   * Onboard as a merchant
   * POST /go/delivery/merchants/onboard
   */
  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  async onboardMerchant(
    @CurrentUser() user: any,
    @Body() dto: OnboardMerchantDto,
  ) {
    return this.merchantsService.onboardMerchant(user.userId, dto.name);
  }

  /**
   * Get current user's merchant profile
   * GET /go/delivery/merchants/me
   */
  @Get('me')
  async getMyMerchant(@CurrentUser() user: any) {
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    if (!merchant) {
      throw new BadRequestException('User is not a merchant');
    }
    return merchant;
  }
}
