import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';

@Entity('kyc_admin_overrides')
export class KycAdminOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({
    type: 'boolean',
    name: 'bypass_kyc_status_gate',
    default: false,
  })
  bypass_kyc_status_gate: boolean;

  @Column({ type: 'boolean', name: 'bypass_all_limits', default: false })
  bypass_all_limits: boolean;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'boost_daily_outflow_mad',
    default: 0,
  })
  boost_daily_outflow_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'boost_monthly_outflow_mad',
    default: 0,
  })
  boost_monthly_outflow_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'boost_max_single_transfer_mad',
    default: 0,
  })
  boost_max_single_transfer_mad: string | number;

  @Column({ type: 'jsonb', name: 'extra_allowed_country_codes' })
  extra_allowed_country_codes: string[];

  @Column({
    type: 'smallint',
    name: 'bypass_limits_maker_version',
    default: 0,
  })
  bypass_limits_maker_version: number;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'bypass_limits_second_approver_admin_id',
  })
  bypass_limits_second_approver_admin_id: string | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'boost_daily_withdrawal_mad',
    default: 0,
  })
  boost_daily_withdrawal_mad: string | number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'boost_monthly_withdrawal_mad',
    default: 0,
  })
  boost_monthly_withdrawal_mad: string | number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by_admin_user_id' })
  created_by_admin_user_id: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'expires_at' })
  expires_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
