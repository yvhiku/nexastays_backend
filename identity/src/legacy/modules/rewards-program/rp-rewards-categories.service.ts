import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpUserCategorySelection } from './entities/rp-user-category-selection.entity';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpBillingPeriodsService } from './rp-billing-periods.service';
import { SelectCategoriesDto } from './dto/select-categories.dto';
import { RpPointsService } from './rp-points.service';
import { RpAchievementsProgramService } from './rp-achievements-program.service';

@Injectable()
export class RpRewardsCategoriesService {
  constructor(
    @InjectRepository(RpUserCategorySelection)
    private readonly selectionRepo: Repository<RpUserCategorySelection>,
    @InjectRepository(RpCashbackTransaction)
    private readonly cashbackTxRepo: Repository<RpCashbackTransaction>,
    private readonly billingPeriods: RpBillingPeriodsService,
    private readonly pointsService: RpPointsService,
    private readonly achievementsProgram: RpAchievementsProgramService,
  ) {}

  async getCurrentPeriodCategoriesWithRates() {
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) return { period: null, categories: [] };
    const pcs = await this.billingPeriods.getPeriodCategories(period.id);
    return {
      period: {
        id: period.id,
        start_date: period.start_date,
        end_date: period.end_date,
      },
      categories: pcs.map((pc) => ({
        id: pc.category.id,
        name: pc.category.name,
        icon: pc.category.icon,
        description: pc.category.description,
        cashback_rate: Number(pc.cashback_rate),
      })),
    };
  }

  async getUserSelections(userId: string, billingPeriodId: number) {
    return this.selectionRepo.find({
      where: { user_id: userId, billing_period_id: billingPeriodId },
      relations: ['category'],
    });
  }

  async getMySelectionsForActivePeriod(userId: string) {
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) return { period: null, selections: [] };
    const selections = await this.getUserSelections(userId, period.id);
    return {
      period: {
        id: period.id,
        start_date: period.start_date,
        end_date: period.end_date,
      },
      selections: selections.map((s) => ({
        categoryId: s.category_id,
        name: s.category.name,
        icon: s.category.icon,
        selected_at: s.selected_at,
      })),
    };
  }

  async selectCategories(userId: string, dto: SelectCategoriesDto) {
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) {
      throw new BadRequestException('No active billing period');
    }
    const ids = [...new Set(dto.categoryIds)];
    if (ids.length !== 4) {
      throw new BadRequestException('Exactly 4 distinct categories required');
    }
    const periodCats = await this.billingPeriods.getPeriodCategories(period.id);
    const allowed = new Set(periodCats.map((pc) => pc.category_id));
    for (const cid of ids) {
      if (!allowed.has(cid)) {
        throw new BadRequestException(
          `Category ${cid} is not in this billing period`,
        );
      }
    }
    await this.selectionRepo.delete({
      user_id: userId,
      billing_period_id: period.id,
    });
    const rows = ids.map((category_id) =>
      this.selectionRepo.create({
        user_id: userId,
        billing_period_id: period.id,
        category_id,
      }),
    );
    await this.selectionRepo.save(rows);
    await this.pointsService
      .awardCategorySelectionPoints(userId, period.id)
      .catch(() => {});
    await this.achievementsProgram
      .checkAndUnlock(userId, period.id)
      .catch(() => {});
    return this.getMySelectionsForActivePeriod(userId);
  }

  async canReselect(userId: string): Promise<{ canReselect: boolean; reason?: string }> {
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) {
      return { canReselect: false, reason: 'No active billing period' };
    }
    const hasCashback = await this.cashbackTxRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.billing_period_id = :pid', { pid: period.id })
      .andWhere("t.status = 'settled'")
      .getExists();
    if (hasCashback) {
      return {
        canReselect: false,
        reason: 'Cashback already earned this period; selections are locked',
      };
    }
    const start = new Date(period.start_date);
    const deadline = new Date(
      start.getFullYear(),
      start.getMonth(),
      5,
      23,
      59,
      59,
      999,
    );
    if (new Date() > deadline) {
      return {
        canReselect: false,
        reason: 'Category selection window closed (after 5th of start month)',
      };
    }
    return { canReselect: true };
  }
}
