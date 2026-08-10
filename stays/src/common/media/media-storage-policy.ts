/**
 * PROD-SEC-002 — production object-storage fail-closed policy.
 *
 * Soft-launch dogfood (NEXA_ENV=dogfood) may use local disk.
 * Real production (NEXA_ENV=production) requires MEDIA_SERVICE_URL —
 * no silent local filesystem fallback.
 */

import * as path from 'path';

export type MediaStage = 'development' | 'dogfood' | 'staging' | 'production';

export function resolveMediaStage(
  env: NodeJS.ProcessEnv = process.env,
): MediaStage {
  const explicit = (env.NEXA_ENV || env.APP_ENV || '').trim().toLowerCase();
  if (
    explicit === 'production' ||
    explicit === 'staging' ||
    explicit === 'dogfood' ||
    explicit === 'development'
  ) {
    return explicit;
  }
  if (env.NODE_ENV === 'production') return 'production';
  return 'development';
}

/** Primary production path: platform media-service. */
export function hasMediaServiceUrl(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !!(env.MEDIA_SERVICE_URL || '').trim();
}

export function isLocalMediaStorageAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const stage = resolveMediaStage(env);
  if (stage === 'development') return true;
  if (stage === 'production') return false;
  if (env.MEDIA_ALLOW_LOCAL_STORAGE === 'true') return true;
  return !hasMediaServiceUrl(env);
}

/**
 * Real production must have MEDIA_SERVICE_URL.
 * MEDIA_ALLOW_LOCAL_STORAGE=true is rejected in production.
 */
export function assertProductionMediaStorageConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveMediaStage(env);
  if (stage !== 'production') return;

  if (env.MEDIA_ALLOW_LOCAL_STORAGE === 'true') {
    throw new Error(
      'MEDIA_ALLOW_LOCAL_STORAGE is not permitted when NEXA_ENV=production (PROD-SEC-002).',
    );
  }

  if (!hasMediaServiceUrl(env)) {
    throw new Error(
      'Production requires MEDIA_SERVICE_URL (platform media-service). Local filesystem fallback is disabled (PROD-SEC-002).',
    );
  }
}

/**
 * Sanitize + resolve a relative storage key under rootDir.
 * Rejects traversal, absolute paths, NUL bytes.
 */
export function assertSafeRelativeStorageKey(
  rootDir: string,
  storageKey: string,
): string {
  const normalizedKey = storageKey.replace(/\\/g, '/');
  if (
    !normalizedKey ||
    normalizedKey.startsWith('/') ||
    normalizedKey.includes('..') ||
    normalizedKey.includes('\0') ||
    !/^[a-zA-Z0-9._/-]+$/.test(normalizedKey)
  ) {
    throw new Error('Invalid storage key');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, normalizedKey);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

/** Normalize a caller relative key (no root prefix). */
export function normalizeRelativeMediaKey(storageKey: string): string {
  const normalizedKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalizedKey ||
    normalizedKey.includes('..') ||
    normalizedKey.includes('\0') ||
    !/^[a-zA-Z0-9._/-]+$/.test(normalizedKey)
  ) {
    throw new Error('Invalid storage key');
  }
  return normalizedKey;
}

/** Explicit SVG rejection (SVG is never in the image allowlist). */
export function isSvgBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  const head = buffer
    .subarray(0, Math.min(256, buffer.length))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith('<svg') ||
    (head.startsWith('<?xml') && head.includes('<svg'))
  );
}
