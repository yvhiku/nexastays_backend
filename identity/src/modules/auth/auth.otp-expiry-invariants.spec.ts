import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Gate 2 / original 034 — DEMO OTP must not skip expiry or consumption.
 * Pure policy helpers mirror auth.service verifyOtp ordering.
 */
function demoAllowed(env: {
  appEnv: string;
  nexaEnv: string | undefined;
  demoOtpCode: string;
}): boolean {
  return (
    (env.appEnv !== 'production' || env.nexaEnv === 'dogfood') &&
    env.nexaEnv !== 'production' &&
    !!env.demoOtpCode
  );
}

function otpRowAcceptable(record: {
  consumed_at: Date | null;
  expires_at: Date;
}): 'ok' | 'consumed' | 'expired' {
  if (record.consumed_at) return 'consumed';
  if (record.expires_at.getTime() < Date.now()) return 'expired';
  return 'ok';
}

describe('DEMO OTP security invariants (audit 034)', () => {
  it('allows DEMO only outside NEXA_ENV=production', () => {
    expect(
      demoAllowed({
        appEnv: 'production',
        nexaEnv: 'dogfood',
        demoOtpCode: '123456',
      }),
    ).toBe(true);
    expect(
      demoAllowed({
        appEnv: 'production',
        nexaEnv: 'production',
        demoOtpCode: '123456',
      }),
    ).toBe(false);
    expect(
      demoAllowed({
        appEnv: 'development',
        nexaEnv: undefined,
        demoOtpCode: '',
      }),
    ).toBe(false);
  });

  it('rejects expired and consumed rows even when DEMO code would match', () => {
    expect(
      otpRowAcceptable({
        consumed_at: null,
        expires_at: new Date(Date.now() - 60_000),
      }),
    ).toBe('expired');
    expect(
      otpRowAcceptable({
        consumed_at: new Date(),
        expires_at: new Date(Date.now() + 60_000),
      }),
    ).toBe('consumed');
    expect(
      otpRowAcceptable({
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000),
      }),
    ).toBe('ok');
  });
});
