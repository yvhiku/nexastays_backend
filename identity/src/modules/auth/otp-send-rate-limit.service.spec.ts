import { beforeEach, describe, expect, it } from '@jest/globals';
import { OtpSendRateLimitService } from './otp-send-rate-limit.service';

describe('OtpSendRateLimitService', () => {
  let service: OtpSendRateLimitService;

  beforeEach(() => {
    service = new OtpSendRateLimitService();
  });

  it('allows sends under the per-minute limit then rejects', () => {
    const phone = '+212600000010';
    const ip = '127.0.0.1';
    // Dev NODE_ENV ≠ production → MAX_PER_MINUTE = 30
    for (let i = 0; i < 30; i += 1) {
      expect(service.checkAndIncrement(phone, ip)).toBe(true);
    }
    expect(service.checkAndIncrement(phone, ip)).toBe(false);
  });

  it('isolates limits per phone+ip key', () => {
    const ip = '10.0.0.2';
    expect(service.checkAndIncrement('+212600000011', ip)).toBe(true);
    expect(service.checkAndIncrement('+212600000012', ip)).toBe(true);
  });
});
