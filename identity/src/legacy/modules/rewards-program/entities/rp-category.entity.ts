import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RpBillingPeriodCategory } from './rp-billing-period-category.entity';
import { RpUserCategorySelection } from './rp-user-category-selection.entity';
import { RpCashbackTransaction } from './rp-cashback-transaction.entity';
import { RpMerchantOffer } from './rp-merchant-offer.entity';

@Entity('rp_categories')
export class RpCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  icon: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => RpBillingPeriodCategory, (c) => c.category)
  period_links: RpBillingPeriodCategory[];

  @OneToMany(() => RpUserCategorySelection, (s) => s.category)
  selections: RpUserCategorySelection[];

  @OneToMany(() => RpCashbackTransaction, (t) => t.category)
  cashback_rows: RpCashbackTransaction[];

  @OneToMany(() => RpMerchantOffer, (o) => o.category)
  offers: RpMerchantOffer[];
}
