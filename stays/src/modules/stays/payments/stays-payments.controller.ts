import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { SENSITIVE_WRITE_THROTTLE } from '../../../common/abuse/throttle-presets';
import { StaysPaymentsService } from './stays-payments.service';
import {
  CreatePaymentIntentDto,
  MockPaymentWebhookDto,
} from '../dto/input-security.dto';
import { isLegacyMockWebhookEnabled } from './payment-provider.config';

@ApiTags('Stays Payments')
@Controller('stays')
export class StaysPaymentsController {
  constructor(private readonly paymentsService: StaysPaymentsService) {}

  @Post('bookings/:id/payments/intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment order for booking' })
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

  @Post('bookings/:id/payments/mock-confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle(SENSITIVE_WRITE_THROTTLE)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate mock payment success (authenticated guest only)',
  })
  @ApiResponse({ status: 200, description: 'Payment confirmed or already processed' })
  @ApiResponse({ status: 400, description: 'Booking not payable' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Booking or payment intent not found' })
  async confirmMockPayment(
    @Param('id', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.paymentsService.confirmMockPayment(bookingId, user.userId);
  }

  /**
   * @deprecated Unauthenticated mock webhook — disabled by default.
   * Use POST /bookings/:id/payments/mock-confirm with JWT instead.
   * Retained only when ALLOW_LEGACY_MOCK_WEBHOOK=true in non-production.
   */
  @Post('webhooks/payments/mock')
  @Public()
  @ApiOperation({ summary: 'Legacy mock webhook (local dev only — deprecated)' })
  async mockWebhook(@Body() body: MockPaymentWebhookDto) {
    if (!isLegacyMockWebhookEnabled()) {
      throw new ForbiddenException(
        'Legacy mock payment webhook is disabled. Use authenticated POST /stays/bookings/:id/payments/mock-confirm.',
      );
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
