import { NotFoundException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';
import type { Response } from 'express';

/**
 * Stream a media delivery path to the client.
 *
 * Remote backends (media-service) return signed HTTP URLs that often use
 * Docker-internal hostnames (e.g. http://media:3004). Browsers cannot follow
 * those redirects, so we proxy the bytes through Stays instead of redirecting.
 */
export async function deliverStoredMedia(
  res: Response,
  delivery: string,
  options?: {
    contentType?: string;
    cacheControl?: string;
  },
): Promise<void> {
  const cacheControl = options?.cacheControl ?? 'public, max-age=3600';
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (/^https?:\/\//i.test(delivery)) {
    const upstream = await fetch(delivery);
    if (!upstream.ok || !upstream.body) {
      throw new NotFoundException('Media not found');
    }
    const contentType =
      options?.contentType ||
      upstream.headers.get('content-type') ||
      'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    Readable.fromWeb(
      upstream.body as unknown as ReadableStream<Uint8Array>,
    ).pipe(res);
    return;
  }

  const ext = delivery.includes('.')
    ? delivery.split('.').pop()?.toLowerCase()
    : '';
  const contentType =
    options?.contentType ||
    (ext === 'mp4'
      ? 'video/mp4'
      : ext === 'webm'
        ? 'video/webm'
        : ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'pdf'
                ? 'application/pdf'
                : 'application/octet-stream');
  res.setHeader('Content-Type', contentType);
  createReadStream(delivery).pipe(res);
}
