import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../security/secrets';

@Injectable()
export class IdentityUserClient {
  private readonly logger = new Logger(IdentityUserClient.name);
  private readonly nameCache = new Map<
    string,
    { value: string | null; expiresAt: number; verified?: boolean }
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

  async getProfileSummary(
    userId: string,
  ): Promise<{ fullName: string | null; verified: boolean } | null> {
    if (!userId) return null;
    const cached = this.nameCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
        ? { fullName: cached.value, verified: cached.verified ?? false }
        : null;
    }
    try {
      const res = await fetch(
        `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/profile-summary`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok) {
        this.nameCache.set(userId, { value: null, expiresAt: Date.now() + 60_000, verified: false });
        return null;
      }
      const data = (await res.json()) as { fullName?: string | null; verified?: boolean };
      const value = data.fullName?.trim() || null;
      this.nameCache.set(userId, {
        value,
        expiresAt: Date.now() + 5 * 60_000,
        verified: !!data.verified,
      });
      return { fullName: value, verified: !!data.verified };
    } catch (err) {
      this.logger.debug(`profile summary failed for ${userId}: ${err}`);
      return null;
    }
  }
}
