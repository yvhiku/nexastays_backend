import { OtpLockoutService } from './otp-lockout.service';
import { OtpAttempt } from './entities/otp-attempt.entity';

describe('OtpLockoutService', () => {
  const records = new Map<string, OtpAttempt>();
  const key = (phone: string, ip: string) => `${phone}|${ip}`;

  const repo = {
    findOne: jest.fn(
      async ({ where }: { where: { phone_number: string; ip: string } }) => {
        return records.get(key(where.phone_number, where.ip)) ?? null;
      },
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

  let service: OtpLockoutService;

  beforeEach(() => {
    records.clear();
    jest.clearAllMocks();
    service = new OtpLockoutService(repo as never);
  });

  it('locks after 5 failures for ~15 minutes', async () => {
    const phone = '+212600000001';
    const ip = '127.0.0.1';
    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure(phone, ip);
    }
    await expect(service.isLockedOut(phone, ip)).resolves.toBe(true);
    const row = records.get(key(phone, ip));
    expect(row?.failed_count).toBe(5);
    expect(row?.locked_until).toBeTruthy();
    const remainingMs = (row!.locked_until as Date).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(14 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('resets failed count after successful verify', async () => {
    const phone = '+212600000002';
    const ip = '10.0.0.1';
    await service.recordFailure(phone, ip);
    await service.recordFailure(phone, ip);
    await service.recordSuccess(phone, ip);
    await expect(service.isLockedOut(phone, ip)).resolves.toBe(false);
    const row = records.get(key(phone, ip));
    expect(row?.failed_count).toBe(0);
    expect(row?.locked_until).toBeNull();
  });
});
