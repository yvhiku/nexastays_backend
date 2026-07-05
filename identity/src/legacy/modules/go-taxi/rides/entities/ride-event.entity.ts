import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ride } from './ride.entity';

@Entity('ride_events', { schema: 'go' })
@Index(['ride_id'])
@Index(['created_at'])
export class RideEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ride_id' })
  ride_id: string;

  @ManyToOne(() => Ride, (ride) => ride.events)
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ type: 'varchar', length: 50, name: 'event_type' })
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
