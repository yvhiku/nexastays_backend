import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { SignedMedia } from './messaging.types';
import { isProductionRuntime, requirePublicBaseUrl } from '../../common/security/secrets';

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export interface ListingCoverVariant {
  w?: number;
  h?: number;
  fit?: 'crop' | 'cover';
}

@Injectable()
export class MessagingMediaService {
  private signingSecret(): string {
    const fromEnv =
      process.env.MESSAGING_MEDIA_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim();
    if (fromEnv) return fromEnv;
    if (isProductionRuntime()) {
      throw new Error(
        'MESSAGING_MEDIA_SECRET or JWT_SECRET is required in production for signed media URLs.',
      );
    }
    return 'nexa-messaging-media-dev';
  }

  private publicBaseUrl(): string {
    const base = requirePublicBaseUrl('STAYS_PUBLIC_URL', 'http://127.0.0.1:3002');
    const withApi = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
    return withApi;
  }

  signPayload(payload: Record<string, string | number>): string {
    const canonical = Object.keys(payload)
      .sort()
      .map((k) => `${k}=${payload[k]}`)
      .join('&');
    return createHmac('sha256', this.signingSecret()).update(canonical).digest('hex');
  }

  verifySignature(
    payload: Record<string, string | number>,
    signature: string,
  ): boolean {
    const expected = this.signPayload(payload);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  resolveAvatar(userId: string, version = 1, ttlMs = DEFAULT_TTL_MS): SignedMedia {
    const exp = Date.now() + ttlMs;
    const sig = this.signPayload({ userId, exp, v: version, kind: 'avatar' });
    return {
      url: `${this.publicBaseUrl()}/messaging/media/avatars/${encodeURIComponent(userId)}?exp=${exp}&v=${version}&sig=${sig}`,
      version,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  resolveListingCover(
    listingId: string,
    coverMediaId: string | null,
    variant?: ListingCoverVariant,
    version = 1,
    ttlMs = DEFAULT_TTL_MS,
  ): SignedMedia | null {
    if (!coverMediaId || !listingId) return null;
    const exp = Date.now() + ttlMs;
    const w = variant?.w ?? 640;
    const h = variant?.h ?? 360;
    const fit = variant?.fit ?? 'crop';
    const sig = this.signPayload({
      listingId,
      mediaId: coverMediaId,
      exp,
      v: version,
      w,
      h,
      fit,
      kind: 'listing_cover',
    });
    return {
      url: `${this.publicBaseUrl()}/messaging/media/listings/${encodeURIComponent(listingId)}/cover/${encodeURIComponent(coverMediaId)}?exp=${exp}&v=${version}&w=${w}&h=${h}&fit=${fit}&sig=${sig}`,
      version,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  resolveAttachment(
    attachmentId: string,
    variant: 'thumb' | 'full',
    version = 1,
    ttlMs = DEFAULT_TTL_MS,
  ): SignedMedia {
    const exp = Date.now() + ttlMs;
    const sig = this.signPayload({
      attachmentId,
      exp,
      v: version,
      variant,
      kind: 'attachment',
    });
    return {
      url: `${this.publicBaseUrl()}/messaging/media/attachments/${encodeURIComponent(attachmentId)}?exp=${exp}&v=${version}&variant=${variant}&sig=${sig}`,
      version,
      expiresAt: new Date(exp).toISOString(),
    };
  }
}
