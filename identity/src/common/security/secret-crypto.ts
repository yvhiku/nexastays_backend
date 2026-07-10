import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { isArgon2Hash, verifyPinHash, hashPin } from './pin-hasher';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Constant-time string compare for equal-length secrets. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a compare to reduce length-oracle signal on short secrets.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/** HMAC-SHA256 hex digest for OTPs / one-time tokens at rest. */
export function hmacSha256Hex(pepper: string, value: string): string {
  return crypto.createHmac('sha256', pepper).update(value).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify admin (or other) password against Argon2 hash, or legacy plaintext
 * only when `allowPlaintext` is true (non-production migration path).
 */
export async function verifyPasswordSecret(
  submitted: string,
  stored: string,
  options?: { allowPlaintext?: boolean },
): Promise<boolean> {
  const plain = (submitted || '').trim();
  const configured = (stored || '').trim();
  if (!plain || !configured) return false;

  if (isArgon2Hash(configured)) {
    const { valid } = await verifyPinHash(plain, configured);
    return valid;
  }

  if (options?.allowPlaintext) {
    return timingSafeEqualString(plain, configured);
  }

  return false;
}

export { hashPin, isArgon2Hash };
