import { MoneyMovementIdempotencyStatus } from '../src/common/idempotency/money-movement-idempotency-status';

describe('Money movement idempotency model', () => {
  it('reserves UNCERTAIN for ambiguous server/PSP outcomes (no blind retry)', () => {
    expect(MoneyMovementIdempotencyStatus.UNCERTAIN).toBe('UNCERTAIN');
  });
});
