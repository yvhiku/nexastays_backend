import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpEcosystemReward } from './entities/rp-ecosystem-reward.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RpEcosystemService {
  constructor(
    @InjectRepository(RpEcosystemReward)
    private readonly rewardRepo: Repository<RpEcosystemReward>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async listForUser(userId: string) {
    const now = new Date();
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['nexa_points', 'rewards_tier'],
    });
    const balance = user?.nexa_points ?? 0;
    const rows = await this.rewardRepo.find({
      where: { is_active: true },
      order: { id: 'ASC' },
    });
    return rows
      .filter(
        (r) => !r.valid_until || new Date(r.valid_until) >= now,
      )
      .map((r) => ({
        id: r.id,
        brand: r.brand,
        title: r.title,
        description: r.description,
        image_url: r.image_url,
        points_cost: r.points_cost,
        discount_value: r.discount_value,
        min_tier: r.min_tier,
        canAfford: balance >= r.points_cost,
      }));
  }
}
