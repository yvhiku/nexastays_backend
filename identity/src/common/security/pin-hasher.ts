import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2id$') || hash.startsWith('$argon2i$');
}

export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, ARGON2_OPTIONS);
}

export async function verifyPinHash(
  pin: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash) {
    return { valid: false, needsRehash: false };
  }

  if (isArgon2Hash(storedHash)) {
    const valid = await argon2.verify(storedHash, pin);
    const needsRehash = valid
      ? argon2.needsRehash(storedHash, ARGON2_OPTIONS)
      : false;
    return { valid, needsRehash };
  }

  // Backward compatibility path for existing bcrypt hashes.
  const valid = await bcrypt.compare(pin, storedHash);
  return { valid, needsRehash: valid };
}
