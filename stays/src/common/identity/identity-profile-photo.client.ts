import { Injectable, Logger } from '@nestjs/common';
import { getInternalServiceKey } from '../security/secrets';

@Injectable()
export class IdentityProfilePhotoClient {
  private readonly logger = new Logger(IdentityProfilePhotoClient.name);
  private readonly existsCache = new Map<string, { value: boolean; expiresAt: number }>();

  private baseUrl(): string {
    return (
      process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ??
      'http://127.0.0.1:3001/api/v1'
    );
  }

  private internalHeaders(): Record<string, string> {
    return { 'X-Internal-Key': getInternalServiceKey() };
  }

  async hasProfilePhoto(userId: string): Promise<boolean> {
    if (!userId) return false;
    const cached = this.existsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const res = await fetch(
        `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/profile-photo/exists`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { hasPhoto?: boolean };
      const value = !!data.hasPhoto;
      this.existsCache.set(userId, { value, expiresAt: Date.now() + 5 * 60_000 });
      return value;
    } catch (err) {
      this.logger.debug(`profile photo exists check failed for ${userId}: ${err}`);
      return false;
    }
  }

  async fetchProfilePhoto(
    userId: string,
  ): Promise<{ body: NodeJS.ReadableStream; contentType: string } | null> {
    if (!userId) return null;
    try {
      const res = await fetch(
        `${this.baseUrl()}/internal/users/${encodeURIComponent(userId)}/profile-photo`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok || !res.body) return null;
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      return { body: res.body as unknown as NodeJS.ReadableStream, contentType };
    } catch (err) {
      this.logger.debug(`profile photo fetch failed for ${userId}: ${err}`);
      return null;
    }
  }
}
