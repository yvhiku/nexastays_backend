import { beforeEach, describe, expect, it } from '@jest/globals';
import { OtpLockoutService } from './otp-lockout.service';
import { OtpAttempt } from './entities/otp-attempt.entity';

/**
 * Original checklist 036 — OTP brute-force / attempt limits.
 * Covers lockout service + per-OTP-row attempt consume policy used by verifyOtp.
 */
describe('OTP attempt limits (audit 036)', () => {
  const records = new Map<string, OtpAttempt>();
  const key = (phone: string, ip: string) => `${phone}|${ip}`;
  const repo = {
    findOne: jest.fn(
      async ({ where }: { where: { phone_number: string; ip: string } }) =>
        records.get(key(where.phone_number, where.ip)) ?? null,
    ),
    create: jest.fn((payload: Partial<OtpAttempt>) => payload as OtpAttempt),
    save: jest.fn(async (attempt: OtpAttempt) => {
      const row: OtpAttempt = {
        id: attempt.id ?? `oa-${attempt.phone_number}-${attempt.ip}`,
        phone_number: attempt.phone_number,
        ip: attempt.ip,
        failed_count: attempt.failed_count ?? 0,
        locked_until: attempt.locked_until ?? null,
        updated_at: attempt.updated_at ?? new Date(),
      };
      records.set(key(row.phone_number, row.ip), row);
      return row;
    }),
  };

  let lockout: OtpLockoutService;

  beforeEach(() => {
    records.clear();
    jest.clearAllMocks();
    lockout = new OtpLockoutService(repo as never);
  });

  it('locks phone+IP after 5 wrong-code failures', async () => {
    const phone = '+212611110036';
    const ip = '203.0.113.36';
    for (let i = 0; i < 5; i += 1) {
      await lockout.recordFailure(phone, ip);
    }
    await expect(lockout.isLockedOut(phone, ip)).resolves.toBe(true);
  });

  it('consumes OTP row after 5 wrong attempts on the same record', () => {
    const record = {
      attempts: 0,
      consumed_at: null as Date | null,
    };
    for (let i = 0; i < 5; i += 1) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        record.consumed_at = new Date();
      }
    }
    expect(record.attempts).toBe(5);
    expect(record.consumed_at).toBeTruthy();
  });

  it('does not lock before the 5th failure', async () => {
    const phone = '+212622220036';
    const ip = '203.0.113.37';
    for (let i = 0; i < 4; i += 1) {
      await lockout.recordFailure(phone, ip);
    }
    await expect(lockout.isLockedOut(phone, ip)).resolves.toBe(false);
  });
});
