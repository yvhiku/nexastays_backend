import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import {
  type IdentitySnapshot,
  kycTierToLevel,
} from './identity-snapshot.types';

const SNAPSHOT_TTL_MS = Number(process.env.IDENTITY_SNAPSHOT_TTL_MS ?? 120_000);

@Injectable()
export class IdentitySnapshotService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KycProfile)
    private readonly kycRepo: Repository<KycProfile>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private cacheKey(userId: string): string {
    return `identity:snapshot:${userId}`;
  }

  async getSnapshot(userId: string): Promise<IdentitySnapshot> {
    const cached = await this.cache.get<IdentitySnapshot>(this.cacheKey(userId));
    if (cached) return cached;

    const snapshot = await this.loadSnapshot(userId);
    await this.cache.set(this.cacheKey(userId), snapshot, SNAPSHOT_TTL_MS);
    return snapshot;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.del(this.cacheKey(userId));
  }

  private async loadSnapshot(userId: string): Promise<IdentitySnapshot> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return {
        userId,
        unifiedIdentityId: null,
        kycStatus: 'PENDING',
        kycLevel: 0,
        kycTier: 'NONE',
        kycProvider: null,
        updatedAt: null,
      };
    }

    const kyc = await this.kycRepo.findOne({ where: { user_id: userId } });
    const kycTier = (kyc?.level ?? 'NONE').toUpperCase();
    const kycStatus = (kyc?.status ?? user.kyc_status ?? 'PENDING').toUpperCase();
    const updatedAt =
      kyc?.reviewed_at ??
      kyc?.last_webhook_received_at ??
      user.updated_at ??
      null;

    return {
      userId,
      unifiedIdentityId: user.unified_identity_id ?? null,
      kycStatus,
      kycLevel: kycTierToLevel(kycTier),
      kycTier,
      kycProvider: kyc?.provider ?? null,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    };
  }
}
