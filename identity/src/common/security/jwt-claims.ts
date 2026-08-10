/**
 * Shared JWT issuer/audience configuration (SEC-006).
 * Identity signs; Identity + Stays verify the same values.
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

/** Stable Identity issuer — must match JWT iss claim and passport-jwt issuer option. */
export function getJwtIssuer(): string {
  return requireJwtClaimEnv('JWT_ISSUER', 'http://127.0.0.1:3001/api/v1');
}

/**
 * Platform audience for access tokens consumed by Nexa backends/clients.
 * Single audience keeps Identity↔Stays↔dashboard compatible.
 */
export function getJwtAudience(): string {
  return requireJwtClaimEnv('JWT_AUDIENCE', 'nexa-platform');
}

export function getJwtAccessExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '15m';
}

/** Shorter TTL for ADMINISTRATOR access tokens (SEC-003). Bound for privilege stickiness. */
export function getJwtAdminExpiresIn(): string {
  return process.env.JWT_ADMIN_EXPIRES_IN || '5m';
}
