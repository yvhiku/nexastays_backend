import { Injectable } from '@nestjs/common';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const isDev = process.env.NODE_ENV !== 'production';
const MAX_PER_MINUTE = isDev ? 30 : 5;
const MAX_PER_DAY = isDev ? 100 : 20;

interface Window {
  count: number;
  resetAt: number;
}

@Injectable()
export class OtpSendRateLimitService {
  private readonly perMinute = new Map<string, Window>();
  private readonly perDay = new Map<string, Window>();

  /** Key from phone + ip. */
  private key(phone: string, ip: string): string {
    return `${phone}:${ip}`;
  }

  /** Returns true if send is allowed; false if over limit. */
  checkAndIncrement(phoneNumber: string, ip: string): boolean {
    const k = this.key(phoneNumber, ip);
    const now = Date.now();

    const minWindow = this.perMinute.get(k);
    if (minWindow) {
      if (now >= minWindow.resetAt) {
        this.perMinute.set(k, { count: 1, resetAt: now + MINUTE_MS });
      } else {
        if (minWindow.count >= MAX_PER_MINUTE) return false;
        minWindow.count += 1;
      }
    } else {
      this.perMinute.set(k, { count: 1, resetAt: now + MINUTE_MS });
    }

    const dayWindow = this.perDay.get(k);
    if (dayWindow) {
      if (now >= dayWindow.resetAt) {
        this.perDay.set(k, { count: 1, resetAt: now + DAY_MS });
      } else {
        if (dayWindow.count >= MAX_PER_DAY) return false;
        dayWindow.count += 1;
      }
    } else {
      this.perDay.set(k, { count: 1, resetAt: now + DAY_MS });
    }
    return true;
  }
}
