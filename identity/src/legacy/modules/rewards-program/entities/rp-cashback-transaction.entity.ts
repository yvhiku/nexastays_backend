import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RpBillingPeriod } from './rp-billing-period.entity';
import { RpCategory } from './rp-category.entity';

@Entity('rp_cashback_transactions')
@Unique(['user_id', 'source_transaction_id'])
export class RpCashbackTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int' })
  billing_period_id: number;

  @ManyToOne(() => RpBillingPeriod, (p) => p.cashback_rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'billing_period_id' })
  billing_period: RpBillingPeriod;

  @Column({ type: 'varchar', length: 255 })
  source_transaction_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  merchant_name: string | null;

  @Column({ type: 'int', nullable: true })
  category_id: number | null;

  @ManyToOne(() => RpCategory, (c) => c.cashback_rows, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: RpCategory | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  purchase_amount: string;

  @Column({ type: 'decimal', precision: 4, scale: 2 })
  cashback_rate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  cashback_earned: string;

  @Column({ type: 'varchar', length: 20 })
  cashback_type: 'universal' | 'category';

  @Column({ type: 'varchar', length: 20, default: 'settled' })
  status: 'pending' | 'settled' | 'reversed';

  @Column({ type: 'timestamptz' })
  transaction_date: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
