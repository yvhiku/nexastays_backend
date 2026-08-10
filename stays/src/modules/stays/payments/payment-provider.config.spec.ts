import { ForbiddenException } from '@nestjs/common';
import {
  isLegacyMockWebhookEnabled,
  isMockPaymentProvider,
} from './payment-provider.config';
import { StaysPaymentsController } from './stays-payments.controller';

describe('payment-provider.config', () => {
  const originalProvider = process.env.STAYS_PAYMENT_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacy = process.env.ALLOW_LEGACY_MOCK_WEBHOOK;

  afterEach(() => {
    process.env.STAYS_PAYMENT_PROVIDER = originalProvider;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_LEGACY_MOCK_WEBHOOK = originalLegacy;
  });

  it('isMockPaymentProvider is true when STAYS_PAYMENT_PROVIDER=mock', () => {
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(isMockPaymentProvider()).toBe(true);
  });

  it('legacy webhook requires explicit opt-in and non-production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    process.env.ALLOW_LEGACY_MOCK_WEBHOOK = 'true';
    expect(isLegacyMockWebhookEnabled()).toBe(true);
  });
});

describe('StaysPaymentsController legacy webhook', () => {
  it('Test 9 — public mock webhook throws Forbidden when legacy gate is off', async () => {
    process.env.NODE_ENV = 'development';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    delete process.env.ALLOW_LEGACY_MOCK_WEBHOOK;

    const paymentsService = {
      handleWebhookSuccess: jest.fn(),
    };
    const controller = new StaysPaymentsController(paymentsService as never);

    await expect(
      controller.mockWebhook({ provider_intent_id: 'mock_any' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(paymentsService.handleWebhookSuccess).not.toHaveBeenCalled();
  });
});
