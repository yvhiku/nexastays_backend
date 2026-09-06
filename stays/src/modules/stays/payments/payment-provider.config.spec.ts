import { ForbiddenException } from '@nestjs/common';
import {
  assertPaymentProviderPolicy,
  isHostPayoutEnabled,
  isLegacyMockWebhookEnabled,
  isMockPaymentProvider,
} from './payment-provider.config';
import { StaysPaymentsController } from './stays-payments.controller';

describe('payment-provider.config PROD-OPS-002 / Phase 2A', () => {
  const keys = [
    'STAYS_PAYMENT_PROVIDER',
    'NODE_ENV',
    'NEXA_ENV',
    'APP_ENV',
    'ALLOW_LEGACY_MOCK_WEBHOOK',
    'CMI_CLIENT_ID',
    'CMI_STORE_KEY',
    'CMI_CALLBACK_URL',
    'STAYS_PUBLIC_URL',
    'STAYS_WEB_URL',
    'CMI_PAYMENT_URL',
    'STAYS_HOST_PAYOUT_ENABLED',
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

  it('real production rejects mock and unset default', () => {
    process.env.NEXA_ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    expect(() => assertPaymentProviderPolicy()).toThrow(/cmi/i);
    delete process.env.STAYS_PAYMENT_PROVIDER;
    expect(() => assertPaymentProviderPolicy()).toThrow(/cmi/i);
  });

  it('production accepts explicit cmi with secrets and non-loopback URLs', () => {
    process.env.NEXA_ENV = 'production';
    process.env.NODE_ENV = 'production';
    process.env.STAYS_PAYMENT_PROVIDER = 'cmi';
    process.env.CMI_CLIENT_ID = 'client';
    process.env.CMI_STORE_KEY = 'store';
    process.env.CMI_CALLBACK_URL =
      'https://stays.example/api/v1/stays/webhooks/payments/cmi';
    process.env.STAYS_PUBLIC_URL = 'https://stays.example';
    process.env.STAYS_WEB_URL = 'https://web.example';
    expect(() => assertPaymentProviderPolicy()).not.toThrow();
  });

  it('cmi rejects missing secrets without falling back to mock', () => {
    process.env.NEXA_ENV = 'dogfood';
    process.env.STAYS_PAYMENT_PROVIDER = 'cmi';
    delete process.env.CMI_CLIENT_ID;
    delete process.env.CMI_STORE_KEY;
    expect(() => assertPaymentProviderPolicy()).toThrow(/CMI_CLIENT_ID/);
  });

  it('cmi rejects loopback callback URLs', () => {
    process.env.NEXA_ENV = 'dogfood';
    process.env.STAYS_PAYMENT_PROVIDER = 'cmi';
    process.env.CMI_CLIENT_ID = 'client';
    process.env.CMI_STORE_KEY = 'store';
    process.env.CMI_CALLBACK_URL = 'http://127.0.0.1:3002/callback';
    expect(() => assertPaymentProviderPolicy()).toThrow(/loopback/);
  });

  it('isHostPayoutEnabled is false unless explicitly true', () => {
    delete process.env.STAYS_HOST_PAYOUT_ENABLED;
    expect(isHostPayoutEnabled()).toBe(false);
    process.env.STAYS_HOST_PAYOUT_ENABLED = 'true';
    expect(isHostPayoutEnabled()).toBe(true);
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
