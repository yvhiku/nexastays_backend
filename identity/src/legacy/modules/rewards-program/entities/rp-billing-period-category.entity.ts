import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RpBillingPeriod } from './rp-billing-period.entity';
import { RpCategory } from './rp-category.entity';

@Entity('rp_billing_period_categories')
@Unique(['billing_period_id', 'category_id'])
export class RpBillingPeriodCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  billing_period_id: number;

  @ManyToOne(() => RpBillingPeriod, (p) => p.period_categories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'billing_period_id' })
  billing_period: RpBillingPeriod;

  @Column({ type: 'int' })
  category_id: number;

  @ManyToOne(() => RpCategory, (c) => c.period_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: RpCategory;

  @Column({ type: 'decimal', precision: 4, scale: 2 })
  cashback_rate: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
