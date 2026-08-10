import { BadRequestException } from '@nestjs/common';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
]);

function stripBrackets(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function parseIpv4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

/** True when an IPv4 address must never be contacted (SSRF). */
export function isBlockedIPv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Expand a compressed IPv6 string into 8 hextets (best-effort).
 * Returns null if the address cannot be parsed.
 */
function expandIpv6Hextets(ip: string): number[] | null {
  const bare = stripBrackets(ip).split('%')[0];
  if (!bare.includes(':')) return null;

  // IPv4-mapped / embedded tail: ::ffff:a.b.c.d
  const v4Tail = bare.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  let core = bare;
  let embeddedV4: number[] | null = null;
  if (v4Tail) {
    const v4 = parseIpv4(v4Tail[1]);
    if (!v4) return null;
    embeddedV4 = v4;
    core = bare.slice(0, -v4Tail[0].length) + ':0:0';
  }

  const [leftRaw, rightRaw] = core.split('::');
  const left = leftRaw ? leftRaw.split(':').filter(Boolean) : [];
  const right = rightRaw !== undefined ? (rightRaw ? rightRaw.split(':').filter(Boolean) : []) : [];

  if (core.includes('::')) {
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const hextets = [
      ...left.map((h) => parseInt(h, 16)),
      ...Array(missing).fill(0),
      ...right.map((h) => parseInt(h, 16)),
    ];
    if (hextets.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
    if (embeddedV4) {
      // last 32 bits already zeroed via ':0:0' placeholder — rebuild from v4
      hextets[6] = (embeddedV4[0] << 8) | embeddedV4[1];
      hextets[7] = (embeddedV4[2] << 8) | embeddedV4[3];
    }
    return hextets;
  }

  const parts = core.split(':');
  if (parts.length !== 8) return null;
  const hextets = parts.map((h) => parseInt(h, 16));
  if (hextets.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return hextets;
}

/** True when an IPv6 address must never be contacted (SSRF). */
export function isBlockedIPv6(ip: string): boolean {
  const hextets = expandIpv6Hextets(ip);
  if (!hextets || hextets.length !== 8) return true;

  // Unspecified ::
  if (hextets.every((h) => h === 0)) return true;
  // Loopback ::1
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0 &&
    hextets[6] === 0 &&
    hextets[7] === 1
  ) {
    return true;
  }

  // IPv4-mapped ::ffff:x.x.x.x
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  ) {
    const a = (hextets[6] >> 8) & 0xff;
    const b = hextets[6] & 0xff;
    const c = (hextets[7] >> 8) & 0xff;
    const d = hextets[7] & 0xff;
    return isBlockedIPv4(`${a}.${b}.${c}.${d}`);
  }

  const first = hextets[0];
  // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique local
  if ((first & 0xfe00) === 0xfc00) return true;
  // ff00::/8 multicast
  if ((first & 0xff00) === 0xff00) return true;

  return false;
}

/** True when a destination IP must never be contacted (SSRF). */
export function isBlockedIpAddress(ip: string): boolean {
  const host = stripBrackets(ip);
  const version = isIP(host);
  if (version === 4) return isBlockedIPv4(host);
  if (version === 6) return isBlockedIPv6(host);
  return true;
}

/** Hostnames / literals that must never be fetched (SSRF). */
export function isBlockedOutboundHostname(hostname: string): boolean {
  const host = stripBrackets(hostname);

  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const version = isIP(host);
  if (version === 4 || version === 6) {
    return isBlockedIpAddress(host);
  }

  return false;
}

/**
 * Validate a URL for server-side fetch (ICS sync, etc.).
 * HTTPS only; blocks private/link-local/metadata host literals and credentials.
 * Does NOT perform DNS — callers that fetch must also resolve + pin IPs.
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

export const MAX_OUTBOUND_REDIRECTS = 3;
