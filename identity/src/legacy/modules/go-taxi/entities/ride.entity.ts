import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export const RIDE_STATUSES = [
  'REQUESTED',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'rider_user_id' })
  rider_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'rider_user_id' })
  rider_user: User;

  @Column({ type: 'uuid', name: 'driver_user_id', nullable: true })
  driver_user_id: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'driver_user_id' })
  driver_user: User | null;

  @Column({ type: 'varchar', length: 20, default: 'REQUESTED' })
  status: RideStatus;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'fare_amount' })
  fare_amount: number;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'ride_type',
  })
  ride_type: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'pickup_location',
  })
  pickup_location: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
    name: 'pickup_lat',
  })
  pickup_lat: number | null;

  @Column({
    type: 'decimal',
    precision: 11,
    scale: 8,
    nullable: true,
    name: 'pickup_lng',
  })
  pickup_lng: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'dropoff_location',
  })
  dropoff_location: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  /** Snapshot of FareEstimateDto at booking (audit trail). */
  @Column({ type: 'jsonb', name: 'fare_estimate', nullable: true })
  fare_estimate: Record<string, unknown> | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'fare_final', nullable: true })
  fare_final: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'booking_fee', nullable: true })
  booking_fee: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'commission', nullable: true })
  commission: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'driver_payout', nullable: true })
  driver_payout: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'platform_take', nullable: true })
  platform_take: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'passenger_total', nullable: true })
  passenger_total: number | null;

  @Column({ type: 'decimal', precision: 4, scale: 2, name: 'surge_multiplier', nullable: true })
  surge_multiplier: number | null;

  @Column({ type: 'boolean', name: 'surge_active', nullable: true })
  surge_active: boolean | null;

  @Column({ type: 'varchar', length: 20, name: 'vehicle_type', nullable: true })
  vehicle_type: string | null;

  @Column({ type: 'varchar', length: 255, name: 'cancellation_reason', nullable: true })
  cancellation_reason: string | null;

  @Column({ type: 'varchar', length: 20, name: 'cancelled_by', nullable: true })
  cancelled_by: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'cancellation_fee', nullable: true })
  cancellation_fee: number | null;

  @Column({ type: 'boolean', name: 'cancellation_fee_collected', nullable: true })
  cancellation_fee_collected: boolean | null;

  @Column({ type: 'timestamp', name: 'cancelled_at', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'timestamp', name: 'accepted_at', nullable: true })
  accepted_at: Date | null;
}
