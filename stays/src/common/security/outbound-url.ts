import { BadRequestException } from '@nestjs/common';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
]);

/** Hostnames / literals that must never be fetched (SSRF). */
export function isBlockedOutboundHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

  // IPv4 (including dotted)
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv4-mapped IPv6 :ffff:x.x.x.x
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return isBlockedOutboundHostname(mapped[1]);

  // IPv6 ULA fc00::/7, link-local fe80::/10
  if (host.includes(':')) {
    const normalized = host.split('%')[0];
    if (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a URL for server-side fetch (ICS sync, etc.).
 * HTTPS only; blocks private/link-local/metadata hosts.
 */
export function validateOutboundHttpsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new BadRequestException('Invalid calendar URL');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Calendar URL must use HTTPS');
  }
  if (isBlockedOutboundHostname(url.hostname)) {
    throw new BadRequestException('Calendar URL host is not allowed');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Calendar URL must not include credentials');
  }
  return url.toString();
}
