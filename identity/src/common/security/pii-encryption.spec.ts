import { decryptPii, encryptPii } from './pii-encryption';

describe('PII encryption', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');
  });

  it('round-trips with AES-256-GCM and does not expose plaintext', () => {
    const plaintext = 'AB123456';
    const encrypted = encryptPii(plaintext);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptPii(encrypted)).toBe(plaintext);
  });

  it('keeps legacy plaintext readable during migration', () => {
    expect(decryptPii('legacy value')).toBe('legacy value');
  });
});
