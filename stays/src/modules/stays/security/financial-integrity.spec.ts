import {
  assertPositiveMoney,
  lockIntentAmount,
  roundMoney,
} from './financial-integrity';

describe('financial integrity', () => {
  it('rejects zero and negative amounts', () => {
    expect(() => assertPositiveMoney(0)).toThrow(/greater than zero/);
    expect(() => assertPositiveMoney(-10)).toThrow(/greater than zero/);
  });

  it('locks intent to booking total and rejects client override', () => {
    expect(lockIntentAmount(499.5)).toBe(499.5);
    expect(() => lockIntentAmount(500, 1)).toThrow(/override/);
  });

  it('rounds MAD consistently', () => {
    expect(roundMoney(10.1)).toBe(10.1);
    expect(roundMoney(10.129)).toBe(10.13);
  });
});
