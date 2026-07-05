import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'go_pricing_config', schema: 'go' })
@Index(['vehicle_type'])
@Index(['is_active'])
export class GoPricingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, name: 'vehicle_type', unique: true })
  vehicle_type: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'base_fare' })
  base_fare: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, name: 'per_km_rate' })
  per_km_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, name: 'per_min_rate' })
  per_min_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'min_fare' })
  min_fare: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'booking_fee' })
  booking_fee: number;

  @Column({ type: 'varchar', length: 20, name: 'commission_type', default: 'percentage' })
  commission_type: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'commission_rate', nullable: true })
  commission_rate: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'commission_min' })
  commission_min: number;

  @Column({ type: 'int', name: 'cancellation_window_secs', default: 120 })
  cancellation_window_secs: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'cancellation_fee', default: 0 })
  cancellation_fee: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, name: 'surge_multiplier', default: 1 })
  surge_multiplier: number;

  @Column({ type: 'boolean', name: 'surge_active', default: false })
  surge_active: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
