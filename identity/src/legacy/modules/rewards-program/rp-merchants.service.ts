import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpMerchantOffer } from './entities/rp-merchant-offer.entity';
import { RpBillingPeriodsService } from './rp-billing-periods.service';
import { RpRewardsCategoriesService } from './rp-rewards-categories.service';
import { CreateMerchantOfferDto } from './dto/create-offer.dto';

@Injectable()
export class RpMerchantsService {
  constructor(
    @InjectRepository(RpMerchantOffer)
    private readonly offerRepo: Repository<RpMerchantOffer>,
    private readonly billingPeriods: RpBillingPeriodsService,
    private readonly categories: RpRewardsCategoriesService,
  ) {}

  async listOffers(userId: string, type?: string) {
    const now = new Date();
    const qb = this.offerRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.category', 'c')
      .where('o.is_active = true')
      .andWhere('o.valid_from <= :now', { now })
      .andWhere('o.valid_until >= :now', { now });
    if (type) {
      qb.andWhere('o.offer_type = :type', { type });
    }
    const rows = await qb.orderBy('o.id', 'ASC').getMany();
    const period = await this.billingPeriods.getActivePeriod();
    let preferred = new Set<number>();
    if (period) {
      const sels = await this.categories.getUserSelections(userId, period.id);
      preferred = new Set(sels.map((s) => s.category_id));
    }
    const sorted = [...rows].sort((a, b) => {
      const ap = a.category_id && preferred.has(a.category_id) ? 0 : 1;
      const bp = b.category_id && preferred.has(b.category_id) ? 0 : 1;
      return ap - bp;
    });
    return sorted.map((o) => ({
      id: o.id,
      merchant_name: o.merchant_name,
      merchant_logo: o.merchant_logo,
      category_id: o.category_id,
      category: o.category
        ? { id: o.category.id, name: o.category.name, icon: o.category.icon }
        : null,
      offer_type: o.offer_type,
      offer_title: o.offer_title,
      offer_description: o.offer_description,
      boost_rate: o.boost_rate != null ? Number(o.boost_rate) : null,
      points_multiplier:
        o.points_multiplier != null ? Number(o.points_multiplier) : null,
      voucher_value: o.voucher_value != null ? Number(o.voucher_value) : null,
      min_spend: o.min_spend != null ? Number(o.min_spend) : null,
      funded_by: o.funded_by,
      valid_from: o.valid_from,
      valid_until: o.valid_until,
    }));
  }

  async getOffer(id: number) {
    const o = await this.offerRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!o) throw new NotFoundException('Offer not found');
    return o;
  }

  async adminList() {
    return this.offerRepo.find({
      order: { id: 'DESC' },
      relations: ['category'],
    });
  }

  async adminCreate(dto: CreateMerchantOfferDto) {
    const row = this.offerRepo.create({
      merchant_name: dto.merchant_name,
      merchant_logo: dto.merchant_logo ?? null,
      category_id: dto.category_id ?? null,
      offer_type: dto.offer_type,
      offer_title: dto.offer_title,
      offer_description: dto.offer_description ?? null,
      boost_rate:
        dto.boost_rate != null && dto.boost_rate !== undefined
          ? String(dto.boost_rate)
          : null,
      points_multiplier:
        dto.points_multiplier != null && dto.points_multiplier !== undefined
          ? String(dto.points_multiplier)
          : null,
      voucher_value:
        dto.voucher_value != null && dto.voucher_value !== undefined
          ? String(dto.voucher_value)
          : null,
      min_spend:
        dto.min_spend != null && dto.min_spend !== undefined
          ? String(dto.min_spend)
          : null,
      funded_by: dto.funded_by ?? 'merchant',
      valid_from: new Date(dto.valid_from),
      valid_until: new Date(dto.valid_until),
      is_active: dto.is_active ?? true,
    });
    return this.offerRepo.save(row);
  }

  async adminUpdate(
    id: number,
    patch: Partial<CreateMerchantOfferDto> & { is_active?: boolean },
  ) {
    const o = await this.offerRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Offer not found');
    if (patch.merchant_name != null) o.merchant_name = patch.merchant_name;
    if (patch.merchant_logo !== undefined) o.merchant_logo = patch.merchant_logo ?? null;
    if (patch.category_id !== undefined) o.category_id = patch.category_id ?? null;
    if (patch.offer_type != null) o.offer_type = patch.offer_type;
    if (patch.offer_title != null) o.offer_title = patch.offer_title;
    if (patch.offer_description !== undefined)
      o.offer_description = patch.offer_description ?? null;
    if (patch.boost_rate !== undefined && patch.boost_rate != null)
      o.boost_rate = String(patch.boost_rate);
    if (patch.points_multiplier !== undefined && patch.points_multiplier != null)
      o.points_multiplier = String(patch.points_multiplier);
    if (patch.voucher_value !== undefined && patch.voucher_value != null)
      o.voucher_value = String(patch.voucher_value);
    if (patch.min_spend !== undefined && patch.min_spend != null)
      o.min_spend = String(patch.min_spend);
    if (patch.funded_by != null) o.funded_by = patch.funded_by;
    if (patch.valid_from != null) o.valid_from = new Date(patch.valid_from);
    if (patch.valid_until != null) o.valid_until = new Date(patch.valid_until);
    if (patch.is_active !== undefined) o.is_active = patch.is_active;
    return this.offerRepo.save(o);
  }
}
