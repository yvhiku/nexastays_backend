import { PinLockoutService } from './pin-lockout.service';
import { PinAttempt } from './entities/pin-attempt.entity';

describe('PinLockoutService', () => {
  const records = new Map<string, PinAttempt>();
  const repo = {
    findOne: jest.fn(async ({ where }: { where: { user_id: string } }) => {
      return records.get(where.user_id) ?? null;
    }),
    create: jest.fn((payload: Partial<PinAttempt>) => payload as PinAttempt),
    save: jest.fn(async (attempt: PinAttempt) => {
      const row: PinAttempt = {
        id: attempt.id ?? `pa-${attempt.user_id}`,
        failed_count: attempt.failed_count ?? 0,
        lockout_level: attempt.lockout_level ?? 0,
        first_failed_at: attempt.first_failed_at ?? null,
        lockout_until: attempt.lockout_until ?? null,
        updated_at: attempt.updated_at ?? new Date(),
        user_id: attempt.user_id,
      };
      records.set(row.user_id, row);
      return row;
    }),
  };

  let service: PinLockoutService;

  beforeEach(() => {
    records.clear();
    jest.clearAllMocks();
    service = new PinLockoutService(repo as any);
  });

  it('locks after max failures and returns retry window', async () => {
    const userId = 'u-1';
    let last: Awaited<ReturnType<PinLockoutService['recordFailure']>> | null =
      null;
    for (let i = 0; i < 5; i += 1) {
      last = await service.recordFailure(userId);
    }
    expect(last?.locked).toBe(true);
    expect((last?.retryAfterSeconds ?? 0) > 0).toBe(true);

    const status = await service.getStatus(userId);
    expect(status.locked).toBe(true);
  });

  it('resets counters after successful PIN verification', async () => {
    const userId = 'u-2';
    await service.recordFailure(userId);
    await service.recordFailure(userId);
    await service.recordSuccess(userId);

    const status = await service.getStatus(userId);
    expect(status.locked).toBe(false);
    const row = records.get(userId);
    expect(row?.failed_count).toBe(0);
    expect(row?.lockout_level).toBe(0);
  });
});
