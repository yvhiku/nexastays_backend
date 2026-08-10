/**
 * PROD-SEC-002 — Identity upload storage fail-closed for real production.
 * Local KYC/profile disk writes are allowed in development/dogfood only.
 * Real production requires IDENTITY_DISABLE_LOCAL_UPLOADS=true (Sumsub / no local files).
 */
export type UploadStage = 'development' | 'dogfood' | 'staging' | 'production';

export function resolveUploadStage(
  env: NodeJS.ProcessEnv = process.env,
): UploadStage {
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

export function isIdentityLocalUploadDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.IDENTITY_DISABLE_LOCAL_UPLOADS === 'true';
}

/**
 * Real production must disable Identity local KYC/profile disk uploads.
 * Soft-launch dogfood may keep local uploads.
 */
export function assertProductionIdentityUploadConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveUploadStage(env);
  if (stage !== 'production') return;

  if (env.MEDIA_ALLOW_LOCAL_STORAGE === 'true') {
    throw new Error(
      'MEDIA_ALLOW_LOCAL_STORAGE is not permitted when NEXA_ENV=production (PROD-SEC-002).',
    );
  }

  if (!isIdentityLocalUploadDisabled(env)) {
    throw new Error(
      'Production Identity requires IDENTITY_DISABLE_LOCAL_UPLOADS=true (Sumsub / no local KYC-profile disk uploads) (PROD-SEC-002).',
    );
  }
}

export function assertIdentityLocalUploadsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isIdentityLocalUploadDisabled(env)) {
    throw new Error(
      'Local Identity uploads are disabled (IDENTITY_DISABLE_LOCAL_UPLOADS=true). Use Sumsub or media-service for KYC/profile media.',
    );
  }
}

export function isSvgBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) return false;
  const head = buffer
    .subarray(0, Math.min(256, buffer.length))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}
