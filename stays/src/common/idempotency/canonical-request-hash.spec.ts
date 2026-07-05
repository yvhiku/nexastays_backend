import { canonicalRequestHash } from './canonical-request-hash';

describe('canonicalRequestHash', () => {
  it('matches for key reorder and drops idempotency_key from body', () => {
    const a = { amount: 10, receiver_phone_number: '+212600000000' };
    const b = { receiver_phone_number: '+212600000000', amount: 10 };
    expect(canonicalRequestHash(a)).toBe(canonicalRequestHash(b));
    const withKey = {
      ...a,
      idempotency_key: 'client-body-key-should-not-affect-hash',
    };
    expect(canonicalRequestHash(withKey)).toBe(canonicalRequestHash(a));
  });

  it('changes when a money field changes', () => {
    const h1 = canonicalRequestHash({ amount: 1 });
    const h2 = canonicalRequestHash({ amount: 2 });
    expect(h1).not.toBe(h2);
  });
});
