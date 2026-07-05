import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RpPointsService } from '../rewards-program/rp-points.service';
import { User } from '../users/entities/user.entity';
import { ReferralCode } from './entities/referral-code.entity';
import { Referral } from './entities/referral.entity';
import { isKycVerifiedForMoneyMovement } from '../compliance/kyc-policy/kyc-status';

const REFERRAL_POINTS = 100;

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(ReferralCode)
    private readonly referralCodeRepository: Repository<ReferralCode>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly rpPointsService: RpPointsService,
    private readonly dataSource: DataSource,
  ) {}

  async getCode(userId: string) {
    const code = await this.getOrCreateCode(userId);
    const invited = await this.referralRepository.count({
      where: { referrerId: userId, status: 'COMPLETED' },
    });
    return {
      referralCode: code.code,
      invited,
      rewardPerReferral: REFERRAL_POINTS,
    };
  }

  async apply(userId: string, referralCode: string) {
    const normalizedCode = referralCode.trim().toUpperCase();
    const referral = await this.dataSource.transaction(async (manager) => {
      const codeRow = await manager.getRepository(ReferralCode).findOne({
        where: { code: normalizedCode },
      });
      if (!codeRow) {
        throw new NotFoundException('Referral code not found');
      }
      if (codeRow.userId === userId) {
        throw new BadRequestException('You cannot use your own referral code');
      }

      const referredUser = await manager
        .getRepository(User)
        .findOne({ where: { id: userId } });
      const referrer = await manager
        .getRepository(User)
        .findOne({ where: { id: codeRow.userId } });
      if (!referredUser || !referrer) {
        throw new NotFoundException('Referral users not found');
      }
      if (referredUser.status !== 'ACTIVE' || referrer.status !== 'ACTIVE') {
        throw new BadRequestException('Referral accounts must be active');
      }
      if (!isKycVerifiedForMoneyMovement(referredUser.kyc_status)) {
        throw new BadRequestException('KYC approval required to apply referral');
      }

      const existing = await manager.getRepository(Referral).findOne({
        where: { referredUserId: userId },
      });
      if (existing) {
        throw new BadRequestException('Referral already applied');
      }

      return manager.getRepository(Referral).save({
        referrerId: codeRow.userId,
        referredUserId: userId,
        referralCode: normalizedCode,
        status: 'COMPLETED',
        rewardGranted: true,
      });
    });

    try {
      await this.rpPointsService.awardPoints(
        referral.referrerId,
        'referral',
        REFERRAL_POINTS,
        'Friend joined Nexa Pay',
        `referral-${referral.id}-referrer`,
        'earn',
      );
      await this.rpPointsService.awardPoints(
        userId,
        'referral',
        REFERRAL_POINTS,
        'Referral welcome bonus',
        `referral-${referral.id}-referred`,
        'earn',
      );
    } catch {
      /* Points failure must not roll back referral row; ledger is best-effort here */
    }

    return referral;
  }

  async getHistory(userId: string) {
    const rows = await this.referralRepository.find({
      where: [{ referrerId: userId }, { referredUserId: userId }],
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      referralCode: row.referralCode,
      status: row.status,
      rewardGranted: row.rewardGranted,
      role: row.referrerId === userId ? 'REFERRER' : 'REFERRED',
      createdAt: row.createdAt,
    }));
  }

  private async getOrCreateCode(userId: string) {
    const existing = await this.referralCodeRepository.findOne({
      where: { userId },
    });
    if (existing) return existing;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `NEXA${suffix}`;
      const collision = await this.referralCodeRepository.findOne({
        where: { code },
      });
      if (!collision) {
        return this.referralCodeRepository.save({ userId, code });
      }
    }

    throw new BadRequestException('Could not generate referral code');
  }
}
