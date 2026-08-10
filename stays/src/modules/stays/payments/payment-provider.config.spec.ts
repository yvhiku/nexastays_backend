import { ForbiddenException } from '@nestjs/common';
import {
  assertPaymentProviderPolicy,
  isLegacyMockWebhookEnabled,
  isMockPaymentProvider,
} from './payment-provider.config';
import { StaysPaymentsController } from './stays-payments.controller';

describe('payment-provider.config PROD-OPS-002', () => {
  const keys = [
    'STAYS_PAYMENT_PROVIDER',
    'NODE_ENV',
    'NEXA_ENV',
    'APP_ENV',
    'ALLOW_LEGACY_MOCK_WEBHOOK',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('isMockPaymentProvider is true when STAYS_PAYMENT_PROVIDER=mock', () => {
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(isMockPaymentProvider()).toBe(true);
  });

  it('dogfood allows mock', () => {
    process.env.NEXA_ENV = 'dogfood';
    process.env.NODE_ENV = 'production';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(() => assertPaymentProviderPolicy()).not.toThrow();
  });

  it('staging requires explicit mock provider env', () => {
    process.env.NEXA_ENV = 'staging';
    process.env.NODE_ENV = 'production';
    delete process.env.STAYS_PAYMENT_PROVIDER;
    expect(() => assertPaymentProviderPolicy()).toThrow(/explicitly/);
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(() => assertPaymentProviderPolicy()).not.toThrow();
  });

  it('real production rejects mock', () => {
    process.env.NEXA_ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(() => assertPaymentProviderPolicy()).toThrow(/not allowed/);
  });

  it('legacy webhook requires explicit opt-in and non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    process.env.ALLOW_LEGACY_MOCK_WEBHOOK = 'true';
    expect(isLegacyMockWebhookEnabled()).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isLegacyMockWebhookEnabled()).toBe(false);
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
