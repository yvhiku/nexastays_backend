import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { StaysPaymentsService } from './stays-payments.service';
import * as express from 'express';

@ApiTags('Stays Payments')
@Controller('stays')
export class StaysPaymentsController {
  constructor(private readonly paymentsService: StaysPaymentsService) {}

  @Post('bookings/:id/payments/intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or get payment intent for booking' })
  async createIntent(
    @Param('id') bookingId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { idempotency_key?: string },
  ) {
    return this.paymentsService.createOrGetIntent(
      bookingId,
      user.userId,
      body?.idempotency_key,
    );
  }

  @Post('bookings/:id/payments/wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pay booking with Nexa Pay wallet' })
  async payWithWallet(
    @Param('id') bookingId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.paymentsService.payWithWallet(bookingId, user.userId);
  }

  @Post('webhooks/payments/:provider')
  @Public()
  @ApiOperation({ summary: 'Payment provider webhook' })
  async webhook(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Req() req: express.Request,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    // TODO: Verify webhook signature using env key (e.g. STAYS_WEBHOOK_SECRET_${provider})
    // For mock provider, skip verification in dev
    if (provider !== 'mock' && !signature) {
      // In production, reject unsigned webhooks
    }

    const providerIntentId = body?.provider_intent_id as string | undefined;
    if (!providerIntentId) {
      return { received: true };
    }

    // Mock provider: simulate success
    if (provider === 'mock') {
      await this.paymentsService.handleWebhookSuccess(
        provider,
        providerIntentId,
        body as Record<string, unknown>,
      );
    }

    return { received: true };
  }
}
