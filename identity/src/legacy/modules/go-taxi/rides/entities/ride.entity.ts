import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { RideStatus } from '../../enums/ride-status.enum';
import { RideEvent } from './ride-event.entity';
import { GoTransaction } from '../../payouts/entities/go-transaction.entity';
import { RidePricing } from './ride-pricing.entity';

@Entity('rides', { schema: 'go' })
@Index(['rider_user_id'])
@Index(['driver_id'])
@Index(['status'])
@Index(['created_at'])
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'rider_user_id' })
  rider_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'rider_user_id' })
  rider: User;

  @Column({ type: 'uuid', nullable: true, name: 'driver_id' })
  driver_id: string | null;

  @ManyToOne(() => DriverProfile, { nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile | null;

  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.REQUESTED,
  })
  status: RideStatus;

  @Column({ type: 'decimal', precision: 10, scale: 8, name: 'pickup_lat' })
  pickup_lat: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, name: 'pickup_lng' })
  pickup_lng: number;

  @Column({ type: 'decimal', precision: 10, scale: 8, name: 'dropoff_lat' })
  dropoff_lat: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, name: 'dropoff_lng' })
  dropoff_lng: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'estimated_fare' })
  estimated_fare: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    name: 'final_fare',
  })
  final_fare: number | null;

  @Column({ type: 'text', nullable: true, name: 'cancel_reason' })
  cancel_reason: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completed_at: Date | null;

  @OneToMany(() => RideEvent, (event) => event.ride)
  events: RideEvent[];

  @OneToOne(() => GoTransaction, (transaction) => transaction.ride)
  transaction: GoTransaction | null;

  @OneToOne(() => RidePricing, (pricing) => pricing.ride, { nullable: true })
  pricing: RidePricing | null;
}
