import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { StaysPaymentsService } from './stays-payments.service';
import {
  CreatePaymentIntentDto,
  MockPaymentWebhookDto,
} from '../dto/input-security.dto';

@ApiTags('Stays Payments')
@Controller('stays')
export class StaysPaymentsController {
  constructor(private readonly paymentsService: StaysPaymentsService) {}

  @Post('bookings/:id/payments/intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create CMI payment order for booking (returns redirect URL)' })
  async createIntent(
    @Param('id', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createOrGetIntent(
      bookingId,
      user.userId,
      body?.idempotency_key,
    );
  }

  @Post('webhooks/payments/mock')
  @Public()
  @ApiOperation({ summary: 'Mock payment webhook (development only)' })
  async mockWebhook(@Body() body: MockPaymentWebhookDto) {
    const allowMock =
      process.env.NODE_ENV !== 'production' &&
      process.env.STAYS_PAYMENT_PROVIDER === 'mock';
    if (!allowMock) {
      throw new ForbiddenException('Mock payment webhook is disabled');
    }
    await this.paymentsService.handleWebhookSuccess(
      'mock',
      body.provider_intent_id,
      body as unknown as Record<string, unknown>,
    );
    return { received: true };
  }

  @Post('webhooks/payments/cmi')
  @Public()
  @ApiOperation({ summary: 'CMI server-to-server payment callback' })
  async cmiWebhook(@Body() body: Record<string, unknown>) {
    await this.paymentsService.handleCmiCallback(body);
    return { received: true };
  }
}
