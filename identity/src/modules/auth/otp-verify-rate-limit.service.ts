import { Injectable } from '@nestjs/common';

const MINUTE_MS = 60 * 1000;
const isDev = process.env.NODE_ENV !== 'production';
const MAX_PER_MINUTE = isDev ? 50 : 10;

@Injectable()
export class OtpVerifyRateLimitService {
  private readonly window = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private key(phone: string, ip: string): string {
    return `verify:${phone}:${ip}`;
  }

  /** Returns true if verify attempt is allowed (under 10/min). */
  checkAndIncrement(phoneNumber: string, ip: string): boolean {
    const k = this.key(phoneNumber, ip);
    const now = Date.now();
    const w = this.window.get(k);
    if (w) {
      if (now >= w.resetAt) {
        this.window.set(k, { count: 1, resetAt: now + MINUTE_MS });
        return true;
      }
      if (w.count >= MAX_PER_MINUTE) return false;
      w.count += 1;
      return true;
    }
    this.window.set(k, { count: 1, resetAt: now + MINUTE_MS });
    return true;
  }
}
