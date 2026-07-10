/**
 * Resolve secrets from environment. Never hardcode production credentials.
 * Dev-only fallbacks are allowed outside production so local docker-compose works.
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Required in production; optional dev fallback otherwise. */
export function requireSecret(
  name: string,
  options?: { devFallback?: string },
): string {
  const value = (process.env[name] ?? '').trim();
  if (value) return value;
  if (isProductionRuntime()) {
    throw new Error(`${name} is required in production and must be set via environment variables.`);
  }
  if (options?.devFallback !== undefined) return options.devFallback;
  throw new Error(`${name} is not set.`);
}

/** Internal service auth key shared between platform services. */
export function getInternalServiceKey(): string {
  return requireSecret('INTERNAL_SERVICE_KEY', {
    devFallback: 'dev-internal-key',
  });
}
