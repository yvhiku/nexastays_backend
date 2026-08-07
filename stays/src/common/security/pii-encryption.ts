import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ValueTransformer } from 'typeorm';

const PREFIX = 'enc:v1';

function key(): Buffer {
  const encoded = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PII_ENCRYPTION_KEY is required in production.');
    }
    return Buffer.alloc(32, 0);
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return decoded;
}

export function encryptPii(value: string): string {
  if (!value || value.startsWith(`${PREFIX}:`)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptPii(value: string): string {
  if (!value || !value.startsWith(`${PREFIX}:`)) return value;
  const [, , ivText, tagText, cipherText] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const piiTransformer: ValueTransformer = {
  to: (value: string | null | undefined) =>
    value == null ? value : encryptPii(value),
  from: (value: string | null | undefined) =>
    value == null ? value : decryptPii(value),
};
