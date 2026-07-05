import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('kyc_tier_policies')
export class KycTierPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, name: 'tier_key' })
  tier_key: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'max_single_transfer_mad',
  })
  max_single_transfer_mad: string | number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'daily_outflow_mad' })
  daily_outflow_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'monthly_outflow_mad',
  })
  monthly_outflow_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    name: 'max_wallet_balance_mad',
  })
  max_wallet_balance_mad: string | number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'daily_withdrawal_mad',
  })
  daily_withdrawal_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'monthly_withdrawal_mad',
  })
  monthly_withdrawal_mad: string | number;

  /** ISO-3166 alpha-2 uppercase; null = use global default from JSON config */
  @Column({ type: 'jsonb', nullable: true, name: 'allowed_country_codes' })
  allowed_country_codes: string[] | null;

  @Column({ type: 'jsonb', name: 'blocked_country_codes' })
  blocked_country_codes: string[];

  /** e.g. ["CONSUMER","MERCHANT"]; null = any */
  @Column({
    type: 'jsonb',
    nullable: true,
    name: 'allowed_receiver_account_types',
  })
  allowed_receiver_account_types: string[] | null;

  @Column({ type: 'jsonb', name: 'blocked_merchant_user_ids' })
  blocked_merchant_user_ids: string[];

  @Column({
    type: 'int',
    nullable: true,
    name: 'velocity_max_completed_outbound',
  })
  velocity_max_completed_outbound: number | null;

  @Column({ type: 'int', nullable: true, name: 'velocity_window_minutes' })
  velocity_window_minutes: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
