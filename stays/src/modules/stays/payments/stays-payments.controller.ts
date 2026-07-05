import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { StaysPaymentsService } from './stays-payments.service';

@ApiTags('Stays Payments')
@Controller('stays')
export class StaysPaymentsController {
  constructor(private readonly paymentsService: StaysPaymentsService) {}

  @Post('bookings/:id/payments/intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create CMI payment order for booking (returns redirect URL)' })
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

  @Post('webhooks/payments/mock')
  @Public()
  @ApiOperation({ summary: 'Mock payment webhook (development only)' })
  async mockWebhook(@Body() body: Record<string, unknown>) {
    const providerIntentId = body?.provider_intent_id as string | undefined;
    if (providerIntentId) {
      await this.paymentsService.handleWebhookSuccess(
        'mock',
        providerIntentId,
        body,
      );
    }
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
