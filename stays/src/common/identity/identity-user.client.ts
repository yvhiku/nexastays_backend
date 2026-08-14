import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../security/secrets';

export type IdentityProfileSummary = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  verified: boolean;
};

export type IdentityAuthz = {
  authz_version: number;
  status: string;
  account_type: string;
  staff_role?: string;
};

export type IdentitySupportAgentRosterItem = {
  id: string;
  status: string;
  staff_role: string;
};

@Injectable()
export class IdentityUserClient {
  private readonly logger = new Logger(IdentityUserClient.name);
  private readonly summaryCache = new Map<
    string,
    { summary: IdentityProfileSummary | null; expiresAt: number }
  >();

  private baseUrl(): string {
    return (
      process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ??
      'http://127.0.0.1:3001/api/v1'
    );
  }

  private internalHeaders(): Record<string, string> {
    return { 'X-Internal-Key': getInternalServiceKey() };
  }

  async getDisplayName(userId: string): Promise<string | null> {
    const summary = await this.getProfileSummary(userId);
    return summary?.fullName ?? null;
  }

  /**
   * S2S roster of ACTIVE SUPPORT_AGENT accounts for auto-assignment.
   * Returns [] when Identity is unavailable so routing can fail soft.
   */
  async listActiveSupportAgents(): Promise<IdentitySupportAgentRosterItem[]> {
    try {
      const res = await fetch(`${this.baseUrl()}/internal/users/support-agents`, {
        headers: this.internalHeaders(),
      });
      if (!res.ok) {
        this.logger.warn(`support-agent roster failed: ${res.status}`);
        return [];
      }
      const data = (await res.json()) as {
        items?: Array<{ id?: string; status?: string; staff_role?: string }>;
      };
      return (data.items ?? [])
        .filter((row) => !!row.id)
        .map((row) => ({
          id: String(row.id),
          status: String(row.status ?? ''),
          staff_role: String(row.staff_role ?? ''),
        }));
    } catch (err) {
      this.logger.warn(`support-agent roster error: ${err}`);
      return [];
    }
  }

  /**
   * S2S authz lookup for assignee validation. Returns null when the user
   * does not exist (or the identity service returns non-OK).
   */
  async getAuthz(userId: string): Promise<IdentityAuthz | null> {
    if (!userId) return null;
    try {
      const res = await fetch(
        `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/authz`,
        { headers: this.internalHeaders() },
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(`authz lookup failed for ${userId}: ${res.status}`);
        return null;
      }
      const data = (await res.json()) as Partial<IdentityAuthz>;
      return {
        authz_version: Number(data.authz_version ?? 1),
        status: String(data.status ?? ''),
        account_type: String(data.account_type ?? ''),
        staff_role: data.staff_role ? String(data.staff_role) : undefined,
      };
    } catch (err) {
      this.logger.warn(`authz lookup error for ${userId}: ${err}`);
      return null;
    }
  }

  async getProfileSummary(userId: string): Promise<IdentityProfileSummary | null> {
    if (!userId) return null;
    const cached = this.summaryCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.summary;
    }
    try {
      const res = await fetch(
        `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/profile-summary`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok) {
        this.summaryCache.set(userId, {
          summary: null,
          expiresAt: Date.now() + 60_000,
        });
        return null;
      }
      const data = (await res.json()) as {
        fullName?: string | null;
        email?: string | null;
        phone?: string | null;
        verified?: boolean;
      };
      const summary: IdentityProfileSummary = {
        fullName: data.fullName?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        verified: !!data.verified,
      };
      this.summaryCache.set(userId, {
        summary,
        expiresAt: Date.now() + 5 * 60_000,
      });
      return summary;
    } catch (err) {
      this.logger.debug(`profile summary failed for ${userId}: ${err}`);
      return null;
    }
  }
}
