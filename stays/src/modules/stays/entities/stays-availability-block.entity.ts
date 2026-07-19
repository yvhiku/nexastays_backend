import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';

@Entity('stays_availability_blocks')
@Unique(['listing_id', 'date'])
export class StaysAvailabilityBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'boolean', name: 'is_blocked', default: false })
  is_blocked: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  source: 'HOST' | 'ADMIN' | 'BOOKING' | 'ICAL' | null;

  @Column({ type: 'uuid', name: 'external_calendar_id', nullable: true })
  external_calendar_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
