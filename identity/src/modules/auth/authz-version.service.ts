import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

type CacheEntry = {
  version: number;
  status: string;
  accountType: string;
  staffRole: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000;

/**
 * SEC-003: authoritative authz version for ADMIN privilege checks.
 * In-memory TTL cache avoids a DB hit on every admin request.
 */
@Injectable()
export class AuthzVersionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async bump(userId: string): Promise<number> {
    await this.usersRepo.increment({ id: userId }, 'authz_version', 1);
    this.invalidate(userId);
    const row = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'authz_version'],
    });
    return row?.authz_version ?? 1;
  }

  async getAuthzState(userId: string): Promise<{
    authz_version: number;
    status: string;
    account_type: string;
    staff_role: string;
  }> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        authz_version: cached.version,
        status: cached.status,
        account_type: cached.accountType,
        staff_role: cached.staffRole,
      };
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'authz_version', 'status', 'account_type', 'staff_role'],
    });
    if (!user) {
      return {
        authz_version: -1,
        status: 'UNKNOWN',
        account_type: 'CONSUMER',
        staff_role: 'ADMIN',
      };
    }

    const entry: CacheEntry = {
      version: Number(user.authz_version ?? 1),
      status: user.status,
      accountType: user.account_type,
      staffRole: user.staff_role || 'ADMIN',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(userId, entry);
    return {
      authz_version: entry.version,
      status: entry.status,
      account_type: entry.accountType,
      staff_role: entry.staffRole,
    };
  }
}
