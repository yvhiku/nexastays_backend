import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../../common/security/secrets';

type AuthzState = {
  authz_version: number;
  status: string;
  account_type: string;
  staff_role?: string;
};

const CACHE_TTL_MS = 30_000;

/**
 * SEC-003: Stays side admin authz checks via Identity internal API (cached).
 */
@Injectable()
export class IdentityAuthzClient {
  private readonly logger = new Logger(IdentityAuthzClient.name);
  private readonly cache = new Map<
    string,
    AuthzState & { expiresAt: number }
  >();

  private baseUrl(): string {
    return (
      process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ||
      'http://127.0.0.1:3001/api/v1'
    );
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async getAuthzState(userId: string): Promise<AuthzState> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        authz_version: cached.authz_version,
        status: cached.status,
        account_type: cached.account_type,
        staff_role: cached.staff_role,
      };
    }

    const url = `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/authz`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Internal-Key': getInternalServiceKey(),
        },
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) {
        this.logger.warn(`authz lookup failed HTTP ${res.status}`);
        return {
          authz_version: -1,
          status: 'UNKNOWN',
          account_type: 'CONSUMER',
        };
      }
      const body = (await res.json()) as AuthzState;
      const state: AuthzState = {
        authz_version: Number(body.authz_version ?? 1),
        status: String(body.status ?? 'UNKNOWN'),
        account_type: String(body.account_type ?? 'CONSUMER'),
        staff_role: body.staff_role ? String(body.staff_role) : undefined,
      };
      this.cache.set(userId, { ...state, expiresAt: Date.now() + CACHE_TTL_MS });
      return state;
    } catch (err) {
      this.logger.warn(
        `authz lookup error: ${err instanceof Error ? err.name : 'error'}`,
      );
      return { authz_version: -1, status: 'UNKNOWN', account_type: 'CONSUMER' };
    }
  }
}
