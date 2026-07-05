import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RpBillingPeriod } from './rp-billing-period.entity';

@Entity('rp_cashback_summaries')
@Unique(['user_id', 'billing_period_id'])
export class RpCashbackSummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int' })
  billing_period_id: number;

  @ManyToOne(() => RpBillingPeriod, (p) => p.summaries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'billing_period_id' })
  billing_period: RpBillingPeriod;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total_cashback_earned: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  universal_cashback: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  category_cashback: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  cap_limit: string;

  @Column({ type: 'boolean', default: false })
  cap_reached: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
