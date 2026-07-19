import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';

export type ExternalCalendarProvider =
  | 'AIRBNB'
  | 'BOOKING'
  | 'VRBO'
  | 'GOOGLE'
  | 'APPLE'
  | 'DIRECT'
  | 'OTHER';

export type ExternalCalendarStatus =
  | 'ACTIVE'
  | 'SYNCING'
  | 'ERROR'
  | 'PAUSED';

export type ExternalCalendarSyncResult = {
  imported_events?: number;
  removed_events?: number;
  blocked_nights?: number;
  duration_ms?: number;
  not_modified?: boolean;
  last_reservation?: { start: string; end: string } | null;
};

@Entity('stays_external_calendars')
export class StaysExternalCalendar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'varchar', length: 20 })
  provider: ExternalCalendarProvider;

  @Column({
    type: 'varchar',
    length: 120,
    name: 'provider_listing_reference',
    nullable: true,
  })
  provider_listing_reference: string | null;

  @Column({ type: 'varchar', length: 120, default: '' })
  label: string;

  @Column({ type: 'text', name: 'ics_url' })
  ics_url: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: ExternalCalendarStatus;

  @Index()
  @Column({ type: 'timestamptz', name: 'next_sync_at', default: () => 'NOW()' })
  next_sync_at: Date;

  @Column({ type: 'timestamptz', name: 'locked_until', nullable: true })
  locked_until: Date | null;

  @Column({ type: 'timestamptz', name: 'last_attempt_at', nullable: true })
  last_attempt_at: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'last_successful_sync_at',
    nullable: true,
  })
  last_successful_sync_at: Date | null;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  last_error: string | null;

  @Column({ type: 'text', nullable: true })
  etag: string | null;

  @Column({ type: 'text', name: 'last_modified', nullable: true })
  last_modified: string | null;

  @Column({ type: 'int', name: 'sync_version', default: 1 })
  sync_version: number;

  @Column({ type: 'int', name: 'consecutive_failures', default: 0 })
  consecutive_failures: number;

  @Column({ type: 'jsonb', name: 'sync_result', nullable: true })
  sync_result: ExternalCalendarSyncResult | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
