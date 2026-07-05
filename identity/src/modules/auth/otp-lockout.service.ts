import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpAttempt } from './entities/otp-attempt.entity';

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

@Injectable()
export class OtpLockoutService {
  constructor(
    @InjectRepository(OtpAttempt)
    private readonly otpAttemptRepository: Repository<OtpAttempt>,
  ) {}

  /** Returns true if this phone+IP is currently locked out. */
  async isLockedOut(phoneNumber: string, ip: string): Promise<boolean> {
    const record = await this.getOrCreate(phoneNumber, ip);
    if (!record.locked_until) return false;
    if (record.locked_until.getTime() <= Date.now()) {
      record.locked_until = null;
      record.failed_count = 0;
      record.updated_at = new Date();
      await this.otpAttemptRepository.save(record);
      return false;
    }
    return true;
  }

  /** Call on verify failure. Increments failed count; locks out if >= 5 in window. */
  async recordFailure(phoneNumber: string, ip: string): Promise<void> {
    const record = await this.getOrCreate(phoneNumber, ip);
    const now = new Date();
    const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MS);
    if (record.updated_at < windowStart) {
      record.failed_count = 0;
    }
    record.failed_count += 1;
    record.updated_at = now;
    if (record.failed_count >= MAX_FAILED_ATTEMPTS) {
      record.locked_until = new Date(now.getTime() + LOCKOUT_WINDOW_MS);
    }
    await this.otpAttemptRepository.save(record);
  }

  /** Call on verify success. Resets failed count for this phone+IP. */
  async recordSuccess(phoneNumber: string, ip: string): Promise<void> {
    const record = await this.otpAttemptRepository.findOne({
      where: { phone_number: phoneNumber, ip },
    });
    if (!record) return;
    record.failed_count = 0;
    record.locked_until = null;
    record.updated_at = new Date();
    await this.otpAttemptRepository.save(record);
  }

  private async getOrCreate(
    phoneNumber: string,
    ip: string,
  ): Promise<OtpAttempt> {
    let record = await this.otpAttemptRepository.findOne({
      where: { phone_number: phoneNumber, ip },
    });
    if (!record) {
      record = this.otpAttemptRepository.create({
        phone_number: phoneNumber,
        ip,
        failed_count: 0,
        locked_until: null,
      });
      await this.otpAttemptRepository.save(record);
    }
    return record;
  }
}
