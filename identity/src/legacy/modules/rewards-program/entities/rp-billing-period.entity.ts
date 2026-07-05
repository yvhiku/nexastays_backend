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
import { RpCashbackSummary } from './rp-cashback-summary.entity';

@Entity('rp_billing_periods')
export class RpBillingPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamptz' })
  start_date: Date;

  @Column({ type: 'timestamptz' })
  end_date: Date;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => RpBillingPeriodCategory, (c) => c.billing_period)
  period_categories: RpBillingPeriodCategory[];

  @OneToMany(() => RpUserCategorySelection, (s) => s.billing_period)
  user_selections: RpUserCategorySelection[];

  @OneToMany(() => RpCashbackTransaction, (t) => t.billing_period)
  cashback_rows: RpCashbackTransaction[];

  @OneToMany(() => RpCashbackSummary, (s) => s.billing_period)
  summaries: RpCashbackSummary[];
}
