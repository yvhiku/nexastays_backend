import {
  isBlockedIpAddress,
  isBlockedOutboundHostname,
  validateOutboundHttpsUrl,
} from './outbound-url';
import { BadRequestException } from '@nestjs/common';

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
    'https://10.0.0.5/x.ics',
    'https://192.168.1.1/x.ics',
    'https://172.16.0.1/x.ics',
    'https://169.254.169.254/latest/meta-data/',
    'https://0.0.0.0/x.ics',
    'https://[::1]/x.ics',
    'https://[fc00::1]/x.ics',
    'https://metadata.google.internal/',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'https://user:pass@example.com/x.ics',
  ])('rejects %s', (url) => {
    expect(() => validateOutboundHttpsUrl(url)).toThrow(BadRequestException);
  });

  it('detects blocked hostnames and IPs', () => {
    expect(isBlockedOutboundHostname('169.254.169.254')).toBe(true);
    expect(isBlockedOutboundHostname('example.com')).toBe(false);
    expect(isBlockedIpAddress('224.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('8.8.4.4')).toBe(false);
  });
});
