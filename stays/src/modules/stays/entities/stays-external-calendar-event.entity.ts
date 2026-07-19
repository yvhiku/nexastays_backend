import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { StaysExternalCalendar } from './stays-external-calendar.entity';

@Entity('stays_external_calendar_events')
@Unique(['external_calendar_id', 'uid', 'recurrence_id'])
export class StaysExternalCalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'external_calendar_id' })
  external_calendar_id: string;

  @ManyToOne(() => StaysExternalCalendar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'external_calendar_id' })
  calendar: StaysExternalCalendar;

  @Column({ type: 'text' })
  uid: string;

  @Column({ type: 'text', name: 'recurrence_id', default: '' })
  recurrence_id: string;

  @Column({ type: 'date', name: 'start_date' })
  start_date: Date;

  @Column({ type: 'date', name: 'end_date' })
  end_date: Date;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
