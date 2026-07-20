import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessage } from './entities/stays-message.entity';

interface RateBucket {
  timestamps: number[];
  bodies: Map<string, number[]>;
}

@Injectable()
export class MessagingRateLimitService {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly perMinute = 10;
  private readonly perDay = 500;
  private readonly identicalPerMinute = 5;

  constructor(
    @InjectRepository(StaysMessage)
    private readonly messageRepo: Repository<StaysMessage>,
  ) {}

  async assertCanSend(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<void> {
    const key = `${userId}:${conversationId}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], bodies: new Map() };
      this.buckets.set(key, bucket);
    }

    bucket.timestamps = bucket.timestamps.filter((t) => now - t < 86_400_000);
    const lastMinute = bucket.timestamps.filter((t) => now - t < 60_000);
    if (lastMinute.length >= this.perMinute) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (bucket.timestamps.length >= this.perDay) {
      throw new HttpException('Daily message limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const normalized = body.trim().toLowerCase();
    const bodyTimes = bucket.bodies.get(normalized) ?? [];
    const recentBodies = bodyTimes.filter((t) => now - t < 60_000);
    if (recentBodies.length >= this.identicalPerMinute) {
      throw new HttpException('Duplicate message limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    recentBodies.push(now);
    bucket.bodies.set(normalized, recentBodies);
    bucket.timestamps.push(now);
  }
}
