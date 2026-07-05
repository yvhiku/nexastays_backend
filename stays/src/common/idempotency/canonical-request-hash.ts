import * as crypto from 'crypto';

/**
 * Builds a stable JSON document for hashing: sorted keys, strips `idempotency_key`
 * so the axis of deduplication is the header, not duplicated body fields.
 */
export function canonicalizeForIdempotency(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeForIdempotency);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj)
    .filter((k) => k !== 'idempotency_key')
    .sort();
  for (const k of keys) {
    const v = obj[k];
    out[k] = canonicalizeForIdempotency(v);
  }
  return out;
}

export function canonicalRequestHash(payload: unknown): string {
  const canon = canonicalizeForIdempotency(payload);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canon), 'utf8')
    .digest('hex');
}
