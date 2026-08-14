import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../../common/security/secrets';

type AuthzState = {
  authz_version: number;
  status: string;
  account_type: string;
  staff_role?: string;
};

/**
 * SEC-003: Stays side admin authz checks via Identity internal API.
 * Live lookups are not cached so role change, freeze, and av bumps apply
 * on the next request.
 */
@Injectable()
export class IdentityAuthzClient {
  private readonly logger = new Logger(IdentityAuthzClient.name);

  private baseUrl(): string {
    return (
      process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ||
      'http://127.0.0.1:3001/api/v1'
    );
  }

  invalidate(_userId: string): void {
    /* live lookups are uncached */
  }

  async getAuthzState(userId: string): Promise<AuthzState> {
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
      return {
        authz_version: Number(body.authz_version ?? 1),
        status: String(body.status ?? 'UNKNOWN'),
        account_type: String(body.account_type ?? 'CONSUMER'),
        staff_role: body.staff_role ? String(body.staff_role) : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `authz lookup error: ${err instanceof Error ? err.name : 'error'}`,
      );
      return { authz_version: -1, status: 'UNKNOWN', account_type: 'CONSUMER' };
    }
  }
}
