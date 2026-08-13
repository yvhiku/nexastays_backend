import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../security/secrets';

export type IdentityProfileSummary = {
  fullName: string | null;
  email: string | null;
  verified: boolean;
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
        verified?: boolean;
      };
      const summary: IdentityProfileSummary = {
        fullName: data.fullName?.trim() || null,
        email: data.email?.trim() || null,
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
