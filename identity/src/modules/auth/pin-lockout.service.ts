import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { appConfig } from '../../common/config/app.config';
import { PinAttempt } from './entities/pin-attempt.entity';

export interface PinLockoutStatus {
  locked: boolean;
  retryAfterSeconds: number;
  lockedUntil: Date | null;
}

export interface PinFailureResult extends PinLockoutStatus {
  attemptsRemaining: number;
}

@Injectable()
export class PinLockoutService {
  constructor(
    @InjectRepository(PinAttempt)
    private readonly pinAttemptRepository: Repository<PinAttempt>,
  ) {}

  async getStatus(userId: string): Promise<PinLockoutStatus> {
    const attempt = await this.getOrCreate(userId);
    const now = Date.now();
    if (!attempt.lockout_until) {
      return { locked: false, retryAfterSeconds: 0, lockedUntil: null };
    }
    const retryMs = attempt.lockout_until.getTime() - now;
    if (retryMs <= 0) {
      attempt.lockout_until = null;
      attempt.failed_count = 0;
      attempt.first_failed_at = null;
      attempt.updated_at = new Date();
      await this.pinAttemptRepository.save(attempt);
      return { locked: false, retryAfterSeconds: 0, lockedUntil: null };
    }
    return {
      locked: true,
      retryAfterSeconds: Math.ceil(retryMs / 1000),
      lockedUntil: attempt.lockout_until,
    };
  }

  async recordFailure(userId: string): Promise<PinFailureResult> {
    const attempt = await this.getOrCreate(userId);
    const now = new Date();
    const windowMs = appConfig.pinAttemptWindowMinutes * 60 * 1000;

    if (
      !attempt.first_failed_at ||
      now.getTime() - attempt.first_failed_at.getTime() > windowMs
    ) {
      attempt.failed_count = 0;
      attempt.first_failed_at = now;
    }

    attempt.failed_count += 1;
    attempt.updated_at = now;

    if (attempt.failed_count >= appConfig.pinMaxAttempts) {
      attempt.lockout_level += 1;
      const lockoutSeconds = Math.min(
        appConfig.pinBaseLockoutSeconds * 2 ** (attempt.lockout_level - 1),
        appConfig.pinMaxLockoutSeconds,
      );
      attempt.lockout_until = new Date(now.getTime() + lockoutSeconds * 1000);
      attempt.failed_count = 0;
      attempt.first_failed_at = null;
      await this.pinAttemptRepository.save(attempt);
      return {
        locked: true,
        retryAfterSeconds: lockoutSeconds,
        lockedUntil: attempt.lockout_until,
        attemptsRemaining: 0,
      };
    }

    await this.pinAttemptRepository.save(attempt);
    return {
      locked: false,
      retryAfterSeconds: 0,
      lockedUntil: null,
      attemptsRemaining: Math.max(
        appConfig.pinMaxAttempts - attempt.failed_count,
        0,
      ),
    };
  }

  async recordSuccess(userId: string): Promise<void> {
    const attempt = await this.pinAttemptRepository.findOne({
      where: { user_id: userId },
    });
    if (!attempt) return;
    attempt.failed_count = 0;
    attempt.lockout_level = 0;
    attempt.lockout_until = null;
    attempt.first_failed_at = null;
    attempt.updated_at = new Date();
    await this.pinAttemptRepository.save(attempt);
  }

  private async getOrCreate(userId: string): Promise<PinAttempt> {
    let attempt = await this.pinAttemptRepository.findOne({
      where: { user_id: userId },
    });
    if (attempt) return attempt;
    attempt = this.pinAttemptRepository.create({
      user_id: userId,
      failed_count: 0,
      lockout_level: 0,
      first_failed_at: null,
      lockout_until: null,
    });
    return this.pinAttemptRepository.save(attempt);
  }
}
