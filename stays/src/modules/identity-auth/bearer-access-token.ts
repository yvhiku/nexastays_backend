/**
 * Access JWT extraction for Stays (PROD-SEC-001).
 * Bearer only — ambient `nexa_access` is never accepted as Stays authorization.
 */
import type { Request } from 'express';

export function extractBearerAccessToken(request: Request): string | null {
  const authHeader = request.headers?.authorization;
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
