import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysExternalCalendar } from './stays-external-calendar.entity';

export type ExternalCalendarSyncOutcome =
  | 'SUCCESS'
  | 'NOT_MODIFIED'
  | 'TIMEOUT'
  | 'ERROR';

@Entity('stays_external_calendar_sync_logs')
export class StaysExternalCalendarSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'external_calendar_id' })
  external_calendar_id: string;

  @ManyToOne(() => StaysExternalCalendar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'external_calendar_id' })
  calendar: StaysExternalCalendar;

  @Column({ type: 'timestamptz', name: 'started_at', default: () => 'NOW()' })
  started_at: Date;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finished_at: Date | null;

  @Column({ type: 'varchar', length: 30 })
  outcome: ExternalCalendarSyncOutcome;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'int', name: 'imported_events', nullable: true })
  imported_events: number | null;

  @Column({ type: 'int', name: 'removed_events', nullable: true })
  removed_events: number | null;

  @Column({ type: 'int', name: 'blocked_nights', nullable: true })
  blocked_nights: number | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  duration_ms: number | null;
}
