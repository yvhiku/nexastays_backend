import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserProSubscriptionStatus = 'active' | 'past_due' | 'cancelled';

@Entity('user_pro_subscriptions')
export class UserProSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', unique: true })
  user_id: string;

  @Column({ type: 'varchar', length: 10, name: 'billing_period' })
  billing_period: 'monthly' | 'yearly';

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UserProSubscriptionStatus;

  /** Day-of-month (1–31) used for monthly renewals; clamped to month length when billing. */
  @Column({ type: 'smallint', name: 'anchor_day' })
  anchor_day: number;

  @Column({ type: 'timestamptz', name: 'current_period_start' })
  current_period_start: Date;

  @Column({ type: 'timestamptz', name: 'next_billing_at' })
  next_billing_at: Date;

  @Column({ type: 'timestamptz', name: 'past_due_since', nullable: true })
  past_due_since: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
