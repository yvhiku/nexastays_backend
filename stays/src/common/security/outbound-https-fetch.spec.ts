import { BadRequestException } from '@nestjs/common';
import {
  isBlockedIpAddress,
  isBlockedOutboundHostname,
  MAX_OUTBOUND_REDIRECTS,
  validateOutboundHttpsUrl,
} from './outbound-url';
import {
  fetchOutboundHttps,
  resolvePublicAddressesOnly,
} from './outbound-https-fetch';

describe('outbound-url SSRF guards', () => {
  it('allows public https hosts', () => {
    expect(
      validateOutboundHttpsUrl('https://www.airbnb.com/calendar/ical/x.ics'),
    ).toContain('https://www.airbnb.com/');
  });

  it.each([
    'http://example.com/x.ics',
    'https://localhost/x.ics',
    'https://127.0.0.1/x.ics',
    'https://127.1.2.3/x.ics',
    'https://10.0.0.5/x.ics',
    'https://192.168.1.1/x.ics',
    'https://172.16.0.1/x.ics',
    'https://172.31.255.255/x.ics',
    'https://169.254.169.254/latest/meta-data/',
    'https://0.0.0.0/x.ics',
    'https://[::1]/x.ics',
    'https://[fc00::1]/x.ics',
    'https://[fd12:3456:789a::1]/x.ics',
    'https://[fe80::1]/x.ics',
    'https://metadata.google.internal/',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com/x',
    'data:text/plain,hi',
    'https://user:pass@example.com/x.ics',
  ])('rejects %s', (url) => {
    expect(() => validateOutboundHttpsUrl(url)).toThrow(BadRequestException);
  });

  it('detects blocked IP addresses', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.1.2.3')).toBe(true);
    expect(isBlockedIpAddress('172.16.0.1')).toBe(true);
    expect(isBlockedIpAddress('192.168.0.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('fc00::1')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    expect(isBlockedOutboundHostname('example.com')).toBe(false);
  });
});

describe('resolvePublicAddressesOnly / DNS SSRF', () => {
  it('rejects public hostname resolving to a private IP', async () => {
    await expect(
      fetchOutboundHttps('https://evil.example/x.ics', {
        resolveAddresses: async () => [{ address: '10.0.0.8', family: 4 }],
        requestHop: async () => {
          throw new Error('must not connect');
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects mixed public + private DNS records', async () => {
    await expect(
      fetchOutboundHttps('https://mixed.example/x.ics', {
        resolveAddresses: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '192.168.1.10', family: 4 },
        ],
        requestHop: async () => {
          throw new Error('must not connect');
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects IPv6 unique-local DNS results', async () => {
    await expect(
      fetchOutboundHttps('https://ula.example/x.ics', {
        resolveAddresses: async () => [{ address: 'fd00::1', family: 6 }],
        requestHop: async () => {
          throw new Error('must not connect');
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects literal private IPs via resolvePublicAddressesOnly', async () => {
    await expect(resolvePublicAddressesOnly('127.0.0.1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(resolvePublicAddressesOnly('::1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('fetchOutboundHttps redirect SSRF policy', () => {
  const publicResolve = async () => [
    { address: '93.184.216.34', family: 4 as const },
  ];

  it('allows a successful public HTTPS hop', async () => {
    const res = await fetchOutboundHttps('https://calendar.example/feed.ics', {
      resolveAddresses: publicResolve,
      requestHop: async () => ({
        statusCode: 200,
        headers: { 'content-type': 'text/calendar' },
        body: Buffer.from('BEGIN:VCALENDAR\nEND:VCALENDAR\n'),
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toContain('VCALENDAR');
  });

  it('rejects redirect to 127.0.0.1', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        resolveAddresses: publicResolve,
        requestHop: async () => ({
          statusCode: 302,
          headers: { location: 'https://127.0.0.1/secret' },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects redirect to private RFC1918 IP', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        resolveAddresses: publicResolve,
        requestHop: async () => ({
          statusCode: 302,
          headers: { location: 'https://192.168.0.50/cal.ics' },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects HTTPS → HTTP redirect', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        resolveAddresses: publicResolve,
        requestHop: async () => ({
          statusCode: 302,
          headers: { location: 'http://calendar.example/feed.ics' },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects redirect chains exceeding the maximum', async () => {
    let hops = 0;
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        maxRedirects: MAX_OUTBOUND_REDIRECTS,
        resolveAddresses: publicResolve,
        requestHop: async (url) => {
          hops += 1;
          return {
            statusCode: 302,
            headers: {
              location: `https://calendar.example/hop-${hops}.ics`,
            },
            body: Buffer.alloc(0),
          };
        },
      }),
    ).rejects.toThrow(/redirect limit/i);
    expect(hops).toBe(MAX_OUTBOUND_REDIRECTS + 1);
  });

  it('rejects unsafe absolute redirects from relative Location against blocked hosts', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/a/start.ics', {
        resolveAddresses: publicResolve,
        requestHop: async () => ({
          statusCode: 302,
          headers: { location: 'https://169.254.169.254/latest/meta-data/' },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('follows a safe relative redirect to another public HTTPS path', async () => {
    const seen: string[] = [];
    const res = await fetchOutboundHttps(
      'https://calendar.example/a/start.ics',
      {
        resolveAddresses: publicResolve,
        requestHop: async (url) => {
          seen.push(url.pathname);
          if (url.pathname.includes('start')) {
            return {
              statusCode: 302,
              headers: { location: '../feed.ics' },
              body: Buffer.alloc(0),
            };
          }
          return {
            statusCode: 200,
            headers: {},
            body: Buffer.from('BEGIN:VCALENDAR'),
          };
        },
      },
    );
    expect(res.body.toString()).toContain('VCALENDAR');
    expect(seen).toEqual(['/a/start.ics', '/feed.ics']);
  });

  it('rejects malformed Location headers', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        resolveAddresses: publicResolve,
        requestHop: async () => ({
          statusCode: 302,
          headers: { location: '://not-a-url' },
          body: Buffer.alloc(0),
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects redirect whose DNS resolves private after public first hop', async () => {
    await expect(
      fetchOutboundHttps('https://calendar.example/start.ics', {
        resolveAddresses: async (hostname) => {
          if (hostname === 'calendar.example') {
            return [{ address: '93.184.216.34', family: 4 }];
          }
          if (hostname === 'pivot.example') {
            return [{ address: '169.254.169.254', family: 4 }];
          }
          throw new Error(`unexpected host ${hostname}`);
        },
        requestHop: async (url) => {
          if (url.hostname === 'calendar.example') {
            return {
              statusCode: 302,
              headers: { location: 'https://pivot.example/meta' },
              body: Buffer.alloc(0),
            };
          }
          throw new Error('must not connect to pivot');
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
