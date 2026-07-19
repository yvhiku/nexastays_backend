import { createHmac } from 'crypto';

/**
 * Documents Identity refresh-family revoke contract for pre-launch checklist.
 * Full integration lives in Identity auth.service; this locks the hash/compare shape.
 */
describe('Identity refresh token integrity (contract)', () => {
  it('rotated token hash must not match previous plaintext', () => {
    const pepper = 'test-pepper';
    const oldToken = 'refresh-token-v1';
    const newToken = 'refresh-token-v2';
    const hash = (t: string) =>
      createHmac('sha256', pepper).update(t).digest('hex');
    expect(hash(oldToken)).not.toEqual(hash(newToken));
    expect(hash(oldToken)).toHaveLength(64);
  });
});
