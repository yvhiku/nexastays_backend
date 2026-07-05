import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpNexaPointsLedger } from './entities/rp-nexa-points-ledger.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RpRewardsAdminAnalyticsService {
  constructor(
    @InjectRepository(RpCashbackTransaction)
    private readonly cbRepo: Repository<RpCashbackTransaction>,
    @InjectRepository(RpNexaPointsLedger)
    private readonly ledgerRepo: Repository<RpNexaPointsLedger>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getAnalytics() {
    const totalCashbackRow = await this.cbRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.cashback_earned),0)', 'sum')
      .where("t.status = 'settled'")
      .getRawOne();

    const totalPointsRow = await this.ledgerRepo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.points),0)', 'sum')
      .where("l.type = 'earn'")
      .getRawOne();

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const activeUsers = await this.cbRepo
      .createQueryBuilder('t')
      .select('COUNT(DISTINCT t.user_id)', 'c')
      .where('t.created_at >= :since', { since })
      .getRawOne();

    const topCategories = await this.cbRepo
      .createQueryBuilder('t')
      .select('t.category_id', 'category_id')
      .addSelect('COALESCE(SUM(t.cashback_earned),0)', 'total')
      .where("t.status = 'settled'")
      .andWhere('t.category_id IS NOT NULL')
      .groupBy('t.category_id')
      .orderBy('total', 'DESC')
      .limit(10)
      .getRawMany();

    const tierDistribution = await this.userRepo
      .createQueryBuilder('u')
      .select('u.rewards_tier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.rewards_tier')
      .getRawMany();

    const fromDay = new Date();
    fromDay.setDate(fromDay.getDate() - 14);
    const dailyCashback = await this.cbRepo
      .createQueryBuilder('t')
      .select("DATE(t.created_at AT TIME ZONE 'UTC')", 'day')
      .addSelect('COALESCE(SUM(t.cashback_earned),0)', 'total')
      .where("t.status = 'settled'")
      .andWhere('t.created_at >= :from', { from: fromDay })
      .groupBy("DATE(t.created_at AT TIME ZONE 'UTC')")
      .orderBy('day', 'ASC')
      .getRawMany();

    return {
      totalCashbackPaid: Number(totalCashbackRow?.sum ?? 0),
      totalPointsIssued: Number(totalPointsRow?.sum ?? 0),
      activeUsers: Number(activeUsers?.c ?? 0),
      topCategories,
      tierDistribution,
      dailyCashback,
    };
  }
}
