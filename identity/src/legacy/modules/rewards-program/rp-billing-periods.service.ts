import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpBillingPeriod } from './entities/rp-billing-period.entity';
import { RpBillingPeriodCategory } from './entities/rp-billing-period-category.entity';
import { RpCategory } from './entities/rp-category.entity';
import { CreateBillingPeriodDto } from './dto/create-billing-period.dto';
import { SetCategoryRatesDto } from './dto/set-category-rates.dto';

@Injectable()
export class RpBillingPeriodsService {
  constructor(
    @InjectRepository(RpBillingPeriod)
    private readonly periodRepo: Repository<RpBillingPeriod>,
    @InjectRepository(RpBillingPeriodCategory)
    private readonly periodCatRepo: Repository<RpBillingPeriodCategory>,
    @InjectRepository(RpCategory)
    private readonly catRepo: Repository<RpCategory>,
  ) {}

  async findById(id: number): Promise<RpBillingPeriod | null> {
    return this.periodRepo.findOne({ where: { id } });
  }

  getActivePeriod(): Promise<RpBillingPeriod | null> {
    return this.periodRepo.findOne({ where: { is_active: true } });
  }

  async listAll(): Promise<RpBillingPeriod[]> {
    return this.periodRepo.find({ order: { start_date: 'DESC' } });
  }

  async create(dto: CreateBillingPeriodDto): Promise<RpBillingPeriod> {
    const row = this.periodRepo.create({
      start_date: new Date(dto.start_date),
      end_date: new Date(dto.end_date),
      is_active: dto.is_active ?? false,
    });
    return this.periodRepo.save(row);
  }

  async activate(id: number): Promise<RpBillingPeriod> {
    const period = await this.periodRepo.findOne({ where: { id } });
    if (!period) throw new NotFoundException('Billing period not found');
    await this.periodRepo.update({}, { is_active: false });
    period.is_active = true;
    return this.periodRepo.save(period);
  }

  async getPeriodCategories(
    billingPeriodId: number,
  ): Promise<RpBillingPeriodCategory[]> {
    return this.periodCatRepo.find({
      where: { billing_period_id: billingPeriodId },
      relations: ['category'],
    });
  }

  async setPeriodCategories(
    billingPeriodId: number,
    dto: SetCategoryRatesDto,
  ): Promise<RpBillingPeriodCategory[]> {
    const period = await this.periodRepo.findOne({ where: { id: billingPeriodId } });
    if (!period) throw new NotFoundException('Billing period not found');
    await this.periodCatRepo.delete({ billing_period_id: billingPeriodId });
    const rows = dto.categories.map((c) =>
      this.periodCatRepo.create({
        billing_period_id: billingPeriodId,
        category_id: c.categoryId,
        cashback_rate: String(c.cashbackRate),
      }),
    );
    return this.periodCatRepo.save(rows);
  }

  async adminListMasterCategories(): Promise<RpCategory[]> {
    return this.catRepo.find({ order: { id: 'ASC' } });
  }

  async adminCreateMasterCategory(body: {
    name: string;
    icon: string;
    description?: string | null;
  }): Promise<RpCategory> {
    const row = this.catRepo.create({
      name: body.name,
      icon: body.icon,
      description: body.description ?? null,
      is_active: true,
    });
    return this.catRepo.save(row);
  }
}
