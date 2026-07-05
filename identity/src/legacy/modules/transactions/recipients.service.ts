import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { tryNormalizePhoneNumber } from '../../common/phone/phone-normalizer';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { AppTransaction } from './entities/app-transaction.entity';
import { normalizeSubscriptionTier } from '../subscription-limits/subscription-limits.constants';

export type RecipientPublicRow = {
  phone_number: string;
  full_name: string | null;
  profile_photo_url: string | null;
  identity_verified: boolean;
  /** Present when recipient is on Nexa Pro (for badge display). */
  rewards_tier?: 'pro';
};

function publicRewardsTier(
  raw: string | null | undefined,
): 'pro' | undefined {
  return normalizeSubscriptionTier(raw) === 'pro' ? 'pro' : undefined;
}

@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(AppTransaction)
    private readonly transactionRepository: Repository<AppTransaction>,
  ) {}

  private isIdentityVerified(kycStatus: string | null | undefined): boolean {
    const s = (kycStatus ?? 'PENDING').toUpperCase();
    return s === 'APPROVED' || s === 'VERIFIED';
  }

  /**
   * Same phone resolution as P2P transfer: normalized first, then raw.
   */
  async resolveUserWithWalletByPhone(rawPhone: string): Promise<User | null> {
    const trimmed = rawPhone.trim();
    const norm = tryNormalizePhoneNumber(trimmed) ?? trimmed;

    let user = await this.userRepository.findOne({
      where: { phone_number: norm },
      select: [
        'id',
        'phone_number',
        'full_name',
        'profile_photo_url',
        'kyc_status',
        'account_type',
        'rewards_tier',
      ],
    });
    if (!user && norm !== trimmed) {
      user = await this.userRepository.findOne({
        where: { phone_number: trimmed },
        select: [
          'id',
          'phone_number',
          'full_name',
          'profile_photo_url',
          'kyc_status',
          'account_type',
          'rewards_tier',
        ],
      });
    }
    if (!user) {
      return null;
    }

    const wallet = await this.walletRepository.findOne({
      where: { user_id: user.id },
      select: ['id'],
    });
    if (!wallet) {
      return null;
    }

    return user;
  }

  async lookup(rawPhone: string): Promise<
    | ({ registered: true } & RecipientPublicRow)
    | { registered: false; phone_number: string }
  > {
    const trimmed = rawPhone.trim();
    const canonical = tryNormalizePhoneNumber(trimmed) ?? trimmed;
    const user = await this.resolveUserWithWalletByPhone(trimmed);
    if (!user) {
      return { registered: false, phone_number: canonical };
    }
    const phone = user.phone_number;
    if (!phone) {
      return { registered: false, phone_number: canonical };
    }
    const row: { registered: true } & RecipientPublicRow = {
      registered: true,
      phone_number: phone,
      full_name: user.full_name ?? null,
      profile_photo_url: user.profile_photo_url ?? null,
      identity_verified: this.isIdentityVerified(user.kyc_status),
    };
    const tier = publicRewardsTier(user.rewards_tier);
    if (tier) row.rewards_tier = tier;
    return row;
  }

  /**
   * Returns only numbers that belong to a Nexa Pay wallet user. Does not persist client contacts.
   */
  async matchPhones(rawPhones: string[]): Promise<RecipientPublicRow[]> {
    const keys = new Set<string>();
    for (const p of rawPhones) {
      const t = (p ?? '').trim();
      if (!t) continue;
      const n = tryNormalizePhoneNumber(t) ?? t;
      keys.add(n);
      if (n !== t) keys.add(t);
    }
    const phoneList = [...keys];
    if (phoneList.length === 0) {
      return [];
    }

    const users = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin(Wallet, 'w', 'w.user_id = u.id')
      .where('u.phone_number IN (:...phones)', { phones: phoneList })
      .select([
        'u.id',
        'u.phone_number',
        'u.full_name',
        'u.profile_photo_url',
        'u.kyc_status',
        'u.account_type',
        'u.rewards_tier',
        'u.created_at',
      ])
      .orderBy("CASE WHEN u.account_type = 'CONSUMER' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('u.created_at', 'ASC')
      .getMany();

    const byPhone = new Map<string, User>();
    for (const u of users) {
      const p = u.phone_number;
      if (!p) continue;
      if (!byPhone.has(p)) {
        byPhone.set(p, u);
      }
    }

    return [...byPhone.values()].map((u) => {
      const row: RecipientPublicRow = {
        phone_number: u.phone_number as string,
        full_name: u.full_name ?? null,
        profile_photo_url: u.profile_photo_url ?? null,
        identity_verified: this.isIdentityVerified(u.kyc_status),
      };
      const tier = publicRewardsTier(u.rewards_tier);
      if (tier) row.rewards_tier = tier;
      return row;
    });
  }

  async recentRecipients(
    senderUserId: string,
    limit: number,
  ): Promise<RecipientPublicRow[]> {
    const cap = Math.min(Math.max(limit, 1), 30);
    const txns = await this.transactionRepository.find({
      where: {
        sender_user_id: senderUserId,
        type: 'TRANSFER',
        status: 'COMPLETED',
      },
      relations: ['receiver_user'],
      order: { created_at: 'DESC' },
      take: 80,
    });

    const seenPhones = new Set<string>();
    const out: RecipientPublicRow[] = [];

    for (const t of txns) {
      const r = t.receiver_user;
      if (!r?.phone_number) continue;
      if (seenPhones.has(r.phone_number)) continue;
      seenPhones.add(r.phone_number);
      const row: RecipientPublicRow = {
        phone_number: r.phone_number,
        full_name: r.full_name ?? null,
        profile_photo_url: r.profile_photo_url ?? null,
        identity_verified: this.isIdentityVerified(r.kyc_status),
      };
      const tier = publicRewardsTier(r.rewards_tier);
      if (tier) row.rewards_tier = tier;
      out.push(row);
      if (out.length >= cap) break;
    }

    return out;
  }
}
