import { BadRequestException, Logger } from '@nestjs/common';
import { promises as dnsPromises } from 'dns';
import * as https from 'https';
import { isIP } from 'net';
import type { IncomingMessage } from 'http';
import {
  isBlockedIpAddress,
  MAX_OUTBOUND_REDIRECTS,
  validateOutboundHttpsUrl,
} from './outbound-url';

const logger = new Logger('OutboundHttpsFetch');

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type OutboundHttpsResponse = {
  statusCode: number;
  headers: IncomingMessage['headers'];
  body: Buffer;
};

/** One validated hop outcome (production uses pinned HTTPS; tests inject stubs). */
export type OutboundHopResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

export type OutboundHttpsFetchOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Test seam: override DNS resolution. */
  resolveAddresses?: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Test seam: override the TLS request after URL+DNS validation. */
  requestHop?: (
    url: URL,
    pinned: ResolvedAddress,
    headers: Record<string, string> | undefined,
  ) => Promise<OutboundHopResult>;
};

/**
 * Resolve hostname and reject if ANY record is private/loopback/link-local/metadata.
 * Security boundary: mixed public+private sets are rejected entirely (strict policy).
 */
export async function resolvePublicAddressesOnly(
  hostname: string,
): Promise<ResolvedAddress[]> {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const literalVersion = isIP(host);
  if (literalVersion === 4 || literalVersion === 6) {
    if (isBlockedIpAddress(host)) {
      throw new BadRequestException('Calendar URL host is not allowed');
    }
    return [{ address: host, family: literalVersion }];
  }

  let results: Array<{ address: string; family: number }>;
  try {
    results = await dnsPromises.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    logger.warn(
      `DNS lookup failed for outbound host (details redacted): ${err instanceof Error ? err.name : 'error'}`,
    );
    throw new BadRequestException('Calendar URL host is not allowed');
  }

  if (!results.length) {
    throw new BadRequestException('Calendar URL host is not allowed');
  }

  for (const row of results) {
    if (isBlockedIpAddress(row.address)) {
      throw new BadRequestException('Calendar URL host is not allowed');
    }
  }

  return results.map((r) => ({
    address: r.address,
    family: (r.family === 6 ? 6 : 4) as 4 | 6,
  }));
}

/**
 * HTTPS GET with:
 * - URL validation (HTTPS-only, blocked host literals)
 * - DNS resolve + reject any private/metadata IP
 * - connection pinned to a pre-validated public IP (DNS rebinding mitigation)
 * - manual redirect handling; every hop revalidated
 *
 * Do not use fetch(..., { redirect: 'follow' }) for host-controlled URLs.
 */
export async function fetchOutboundHttps(
  rawUrl: string,
  options: OutboundHttpsFetchOptions = {},
): Promise<OutboundHttpsResponse> {
  const maxRedirects = options.maxRedirects ?? MAX_OUTBOUND_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const resolve =
    options.resolveAddresses ?? ((h: string) => resolvePublicAddressesOnly(h));
  const requestHop =
    options.requestHop ??
    ((url, pinned, headers) =>
      httpsGetPinned(url, pinned, {
        headers,
        signal: options.signal,
        timeoutMs,
      }));

  let currentUrl = validateOutboundHttpsUrl(rawUrl);
  let redirects = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw new BadRequestException('Calendar request aborted');
    }

    const url = new URL(currentUrl);
    const addresses = await resolve(url.hostname);
    if (!addresses.length) {
      throw new BadRequestException('Calendar URL host is not allowed');
    }
    // Never trust a resolve seam/DNS cache without re-checking each address.
    for (const addr of addresses) {
      if (isBlockedIpAddress(addr.address)) {
        throw new BadRequestException('Calendar URL host is not allowed');
      }
    }
    const pinned = addresses[0];

    const response = await requestHop(url, pinned, options.headers);

    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const locationRaw = response.headers.location;
      const location = Array.isArray(locationRaw)
        ? locationRaw[0]
        : locationRaw;
      redirects += 1;
      if (redirects > maxRedirects) {
        throw new BadRequestException('Calendar URL redirect limit exceeded');
      }
      if (typeof location !== 'string' || !location.trim()) {
        throw new BadRequestException('Invalid calendar redirect');
      }
      let next: URL;
      try {
        next = new URL(location, currentUrl);
      } catch {
        throw new BadRequestException('Invalid calendar redirect');
      }
      // Every hop must independently pass HTTPS + SSRF policy (+ DNS on next loop).
      currentUrl = validateOutboundHttpsUrl(next.toString());
      continue;
    }

    return {
      statusCode: status,
      headers: response.headers,
      body: response.body,
    };
  }
}

async function httpsGetPinned(
  url: URL,
  pinned: ResolvedAddress,
  opts: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<OutboundHopResult> {
  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = https.request(
      {
        protocol: 'https:',
        hostname: url.hostname,
        servername: url.hostname, // SNI remains the original hostname
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: opts.headers,
        // DNS rebinding mitigation: ignore live DNS; use pre-validated public IP only.
        lookup(
          _hostname: string,
          _options: unknown,
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string,
            family: number,
          ) => void,
        ) {
          callback(null, pinned.address, pinned.family);
        },
      },
      (incoming) => resolve(incoming),
    );

    const onAbort = () => {
      request.destroy(new Error('aborted'));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    request.setTimeout(opts.timeoutMs, () => {
      request.destroy(new Error('timeout'));
    });

    request.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    request.end();
  });

  const body = await readIncomingMessageBody(res, opts.signal);
  return {
    statusCode: res.statusCode ?? 0,
    headers: res.headers,
    body,
  };
}

function readIncomingMessageBody(
  res: IncomingMessage,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const onAbort = () => {
      res.destroy(new Error('aborted'));
      reject(new BadRequestException('Calendar request aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    res.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    res.on('end', () => {
      signal?.removeEventListener('abort', onAbort);
      resolve(Buffer.concat(chunks));
    });
    res.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}
