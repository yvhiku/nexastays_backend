/**
 * Phone number normalization to E.164.
 * Used for identity_phone_numbers and consistent lookups across the system.
 */

import { BadRequestException } from '@nestjs/common';

/** E.164: +[country][subscriber] e.g. +212612345678 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Default country code when none provided (Morocco).
 */
export const DEFAULT_COUNTRY_CODE = '212';

/**
 * Morocco: many users enter +21206… (national trunk 0 after country code).
 * E.164 is +2126… — strip the extra 0 after 212.
 */
function canonicalizeMoroccoTrunkZero(digits: string): string {
  if (digits.startsWith('2120') && digits.length >= 12) {
    const subscriber = digits.slice(4, 13);
    if (subscriber.length === 9) {
      return `212${subscriber}`;
    }
  }
  return digits;
}

/**
 * Normalize phone number to E.164 format.
 * Accepts: 0612345677, 612345677, 212612345677, +212612345677, +2120612345678, +12025551234
 * Returns e.g. +212612345678 or +12025551234
 * @throws Error if input cannot be parsed
 */
export function normalizePhoneNumber(raw: string): string {
  const s = String(raw ?? '').trim();
  const digits = canonicalizeMoroccoTrunkZero(s.replace(/\D/g, ''));

  // Pass through valid E.164 when explicitly prefixed with +
  if (s.startsWith('+') && /^[1-9]\d{9,14}$/.test(digits)) {
    const candidate = `+${digits}`;
    if (E164_REGEX.test(candidate)) return candidate;
  }
  if (!digits || digits.length < 9) {
    throw new Error('Invalid phone number: too few digits');
  }
  let normalized: string;
  if (digits.startsWith('212') && digits.length >= 12) {
    normalized = `+${digits.slice(0, 12)}`;
  } else if (digits.startsWith('0') && digits.length >= 10) {
    normalized = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1).slice(0, 9)}`;
  } else if (digits.startsWith('212') && digits.length >= 9) {
    normalized = `+212${digits.slice(3).slice(0, 9)}`;
  } else if (digits.length >= 9 && digits.startsWith('6')) {
    normalized = `+${DEFAULT_COUNTRY_CODE}${digits.slice(0, 9)}`;
  } else {
    normalized = `+${DEFAULT_COUNTRY_CODE}${digits.slice(-9)}`;
  }
  if (!E164_REGEX.test(normalized) || normalized.length < 12) {
    throw new Error(`Invalid phone number: cannot normalize "${raw}"`);
  }
  return normalized;
}

/**
 * Try to normalize; returns null on failure.
 */
export function tryNormalizePhoneNumber(raw: string): string | null {
  try {
    return normalizePhoneNumber(raw);
  } catch {
    return null;
  }
}

export interface ValidatePhoneResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Validate and optionally normalize. Use for input validation.
 */
export function validatePhoneNumber(raw: string): ValidatePhoneResult {
  const s = String(raw ?? '').trim();
  if (!s) return { valid: false, error: 'Phone number is required' };
  const digits = s.replace(/\D/g, '');
  if (digits.length < 9) return { valid: false, error: 'Phone number has too few digits' };
  if (digits.length > 15) return { valid: false, error: 'Phone number has too many digits' };
  if (/^0+$/.test(digits) || /^0\d{0,5}$/.test(digits)) {
    return { valid: false, error: 'Phone number is invalid or ambiguous' };
  }
  try {
    const normalized = normalizePhoneNumber(s);
    return { valid: true, normalized };
  } catch (e) {
    return { valid: false, error: (e as Error).message ?? 'Invalid phone number' };
  }
}

/**
 * Normalize or throw BadRequestException. Use at API/service entry points.
 */
export function normalizePhoneOrThrow(raw: string): string {
  const result = validatePhoneNumber(raw);
  if (!result.valid) {
    throw new BadRequestException(result.error ?? 'Invalid phone number');
  }
  return result.normalized!;
}

/**
 * All plausible stored forms for the same Moroccan (or E.164) number.
 * Used so logins with 0693211350 match DB rows stored as +212693211350 or 693211350.
 */
export function phoneLookupCandidates(raw: string): string[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];

  const digits = trimmed.replace(/\D/g, '');
  const local9 = digits.length >= 9 ? digits.slice(-9) : '';
  const normalized = tryNormalizePhoneNumber(trimmed);

  const out = new Set<string>();
  if (trimmed) out.add(trimmed);
  if (digits) out.add(digits);
  if (local9) {
    out.add(local9);
    out.add(`0${local9}`);
    out.add(`212${local9}`);
    out.add(`+212${local9}`);
  }
  if (normalized) out.add(normalized);

  return [...out];
}
