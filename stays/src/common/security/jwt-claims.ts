/**
 * JWT issuer/audience — must match Identity signing (SEC-006).
 */

function requireJwtClaimEnv(
  name: 'JWT_ISSUER' | 'JWT_AUDIENCE',
  fallbackDev: string,
): string {
  const raw = (process.env[name] ?? '').trim();
  if (raw) return raw;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production.`);
  }
  return fallbackDev;
}

export function getJwtIssuer(): string {
  return requireJwtClaimEnv('JWT_ISSUER', 'http://127.0.0.1:3001/api/v1');
}

export function getJwtAudience(): string {
  return requireJwtClaimEnv('JWT_AUDIENCE', 'nexa-platform');
}
