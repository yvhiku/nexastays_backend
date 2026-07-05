import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ride } from './ride.entity';

/**
 * RidePricing Entity
 * Persists fare breakdown for audits, disputes, and compliance
 * One-to-one relationship with Ride
 */
@Entity('ride_pricing', { schema: 'go' })
@Index(['ride_id'])
@Index(['created_at'])
export class RidePricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'ride_id' })
  ride_id: string;

  @OneToOne(() => Ride, (ride) => ride.pricing)
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'base_fare' })
  base_fare: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'distance_km' })
  distance_km: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'time_minutes' })
  time_minutes: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'distance_fee' })
  distance_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'time_fee' })
  time_fee: number;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 1.0,
    name: 'surge_multiplier',
  })
  surge_multiplier: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_fare' })
  total_fare: number;

  @Column({ type: 'varchar', length: 3, default: 'MAD' })
  currency: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
