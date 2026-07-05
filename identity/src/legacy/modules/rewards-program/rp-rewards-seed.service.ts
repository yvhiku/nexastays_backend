import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpCategory } from './entities/rp-category.entity';
import { RpBillingPeriod } from './entities/rp-billing-period.entity';
import { RpBillingPeriodCategory } from './entities/rp-billing-period-category.entity';
import { RpAchievement } from './entities/rp-achievement.entity';
import { RpMerchantOffer } from './entities/rp-merchant-offer.entity';
import { RpEcosystemReward } from './entities/rp-ecosystem-reward.entity';

const PERIOD_CATEGORY_RATES: { name: string; icon: string; rate: number }[] = [
  { name: 'Restaurants', icon: 'restaurant', rate: 4 },
  { name: 'Cafés', icon: 'local_cafe', rate: 3 },
  { name: 'Taxi/Rides', icon: 'local_taxi', rate: 2 },
  { name: 'Gaming', icon: 'sports_esports', rate: 5 },
  { name: 'Pharmacies', icon: 'local_pharmacy', rate: 3 },
  { name: 'Grocery Stores', icon: 'shopping_cart', rate: 2 },
  { name: 'Streaming Services', icon: 'movie', rate: 4 },
];

const EXTRA_CATEGORIES = [
  { name: 'Sports Goods', icon: 'fitness_center' },
  { name: 'Electronics', icon: 'devices' },
  { name: 'Fashion', icon: 'checkroom' },
];

const SEED_ACHIEVEMENTS = [
  {
    key: 'first_cashback',
    name: 'First Cashback',
    description: 'Earn your first Nexa Points cashback.',
    icon: 'stars',
    points_reward: 50,
  },
  {
    key: 'category_explorer',
    name: 'Category Explorer',
    description: 'Earn category cashback in all four of your selected categories in one period.',
    icon: 'explore',
    points_reward: 100,
  },
  {
    key: 'smart_selector',
    name: 'Smart Selector',
    description: 'Complete category selection in 3+ consecutive billing periods.',
    icon: 'psychology',
    points_reward: 120,
  },
  {
    key: 'streak_builder',
    name: 'Streak Builder',
    description: '3+ cashback events in each of 4 consecutive weeks.',
    icon: 'local_fire_department',
    points_reward: 150,
  },
  {
    key: 'local_supporter',
    name: 'Local Supporter',
    description: 'Cashback at 5+ distinct merchants featured in Nexa offers.',
    icon: 'storefront',
    points_reward: 100,
  },
  {
    key: 'pro_saver',
    name: 'Pro Saver',
    description: 'Reach 400 MAD cashback in a Pro-tier billing period.',
    icon: 'savings',
    points_reward: 200,
  },
  {
    key: 'premium_maximizer',
    name: 'Premium Maximizer',
    description: 'Reach 1,000 MAD cashback in a Premium-tier billing period.',
    icon: 'diamond',
    points_reward: 300,
  },
];

@Injectable()
export class RpRewardsSeedService implements OnModuleInit {
  private readonly logger = new Logger(RpRewardsSeedService.name);
  private ran = false;

  constructor(
    @InjectRepository(RpCategory)
    private readonly catRepo: Repository<RpCategory>,
    @InjectRepository(RpBillingPeriod)
    private readonly periodRepo: Repository<RpBillingPeriod>,
    @InjectRepository(RpBillingPeriodCategory)
    private readonly pcRepo: Repository<RpBillingPeriodCategory>,
    @InjectRepository(RpAchievement)
    private readonly achRepo: Repository<RpAchievement>,
    @InjectRepository(RpMerchantOffer)
    private readonly offerRepo: Repository<RpMerchantOffer>,
    @InjectRepository(RpEcosystemReward)
    private readonly ecoRepo: Repository<RpEcosystemReward>,
  ) {}

  async onModuleInit() {
    if (this.ran) return;
    this.ran = true;
    try {
      await this.seedIfEmpty();
    } catch (e) {
      this.logger.warn(`Rewards seed skipped: ${(e as Error).message}`);
    }
  }

  private async seedIfEmpty() {
    const n = await this.catRepo.count();
    if (n > 0) return;

    const allDefs = [
      ...PERIOD_CATEGORY_RATES.map((c) => ({
        name: c.name,
        icon: c.icon,
        description: null as string | null,
      })),
      ...EXTRA_CATEGORIES.map((c) => ({
        name: c.name,
        icon: c.icon,
        description: null as string | null,
      })),
    ];

    const cats = await this.catRepo.save(
      allDefs.map((c) =>
        this.catRepo.create({
          name: c.name,
          icon: c.icon,
          description: c.description,
          is_active: true,
        }),
      ),
    );
    const byName = new Map(cats.map((c) => [c.name, c]));

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    await this.periodRepo.update({}, { is_active: false });
    const period = await this.periodRepo.save(
      this.periodRepo.create({
        start_date: start,
        end_date: end,
        is_active: true,
      }),
    );

    const links = PERIOD_CATEGORY_RATES.map((sc) => {
      const cat = byName.get(sc.name)!;
      return this.pcRepo.create({
        billing_period_id: period.id,
        category_id: cat.id,
        cashback_rate: String(sc.rate),
      });
    });
    await this.pcRepo.save(links);

    for (const a of SEED_ACHIEVEMENTS) {
      await this.achRepo.save(this.achRepo.create(a));
    }

    const monthEnd = end;
    const offers: Partial<RpMerchantOffer>[] = [
      {
        merchant_name: 'Café Najma',
        offer_type: 'cashback_boost',
        offer_title: '8% boost',
        offer_description: 'Limited-time café boost',
        boost_rate: '8',
        category_id: byName.get('Cafés')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
      {
        merchant_name: 'Pharma Plus',
        offer_type: 'points_multiplier',
        offer_title: '3x points',
        offer_description: 'Pharmacy multiplier',
        points_multiplier: '3',
        category_id: byName.get('Pharmacies')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
      {
        merchant_name: 'Carrefour Market',
        offer_type: 'voucher',
        offer_title: '20 MAD voucher',
        offer_description: 'Min spend 200 MAD',
        voucher_value: '20',
        min_spend: '200',
        category_id: byName.get('Grocery Stores')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
      {
        merchant_name: 'Netflix',
        offer_type: 'points_multiplier',
        offer_title: '1x points',
        offer_description: 'Streaming',
        points_multiplier: '1',
        category_id: byName.get('Streaming Services')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
      {
        merchant_name: 'Uber',
        offer_type: 'cashback_boost',
        offer_title: '6% rides boost',
        boost_rate: '6',
        category_id: byName.get('Taxi/Rides')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
      {
        merchant_name: 'GameZone',
        offer_type: 'points_multiplier',
        offer_title: '2x points',
        points_multiplier: '2',
        category_id: byName.get('Gaming')!.id,
        valid_from: start,
        valid_until: monthEnd,
        funded_by: 'merchant',
      },
    ];
    for (const o of offers) {
      await this.offerRepo.save(this.offerRepo.create(o as RpMerchantOffer));
    }

    await this.ecoRepo.save([
      this.ecoRepo.create({
        brand: 'nexa_stays',
        title: '10% off your next hotel booking',
        description: 'Nexa Stays',
        points_cost: 2500,
        discount_value: '10%',
        min_tier: 'standard',
        is_active: true,
        valid_until: null,
      }),
      this.ecoRepo.create({
        brand: 'nexa_stays',
        title: 'Free breakfast upgrade',
        description: 'Nexa Stays',
        points_cost: 5000,
        discount_value: 'Breakfast',
        min_tier: 'pro',
        is_active: true,
        valid_until: null,
      }),
      this.ecoRepo.create({
        brand: 'nexa_go',
        title: '50 MAD ride credit',
        description: 'Nexa Go',
        points_cost: 1000,
        discount_value: '50 MAD',
        min_tier: 'standard',
        is_active: true,
        valid_until: null,
      }),
      this.ecoRepo.create({
        brand: 'nexa_go',
        title: 'Premium ride upgrade for a month',
        description: 'Nexa Go',
        points_cost: 3000,
        discount_value: 'Premium month',
        min_tier: 'pro',
        is_active: true,
        valid_until: null,
      }),
    ]);

    this.logger.log('Rewards program seed completed (categories + period + offers).');
  }
}
