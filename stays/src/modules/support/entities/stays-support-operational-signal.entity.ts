import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import type {
  OperationalSignalSeverity,
  OperationalSignalStatus,
  OperationalSignalSubjectType,
  OperationalSignalType,
} from '../operational-signals.constants';

@Entity('stays_support_operational_signals')
@Index('idx_stays_support_ops_signals_queue', [
  'status',
  'severity',
  'last_detected_at',
])
export class StaysSupportOperationalSignal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ticket_id', nullable: true })
  ticket_id: string | null;

  @Column({ type: 'uuid', name: 'report_id', nullable: true })
  report_id: string | null;

  @Column({ type: 'uuid', name: 'safety_issue_id', nullable: true })
  safety_issue_id: string | null;

  @Column({ type: 'varchar', length: 64, name: 'signal_type' })
  signal_type: OperationalSignalType;

  @Column({ type: 'varchar', length: 16 })
  severity: OperationalSignalSeverity;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: OperationalSignalStatus;

  @Column({ type: 'varchar', length: 64, name: 'subject_type' })
  subject_type: OperationalSignalSubjectType;

  @Column({ type: 'varchar', length: 128, name: 'subject_id', nullable: true })
  subject_id: string | null;

  @Column({ type: 'varchar', length: 32, name: 'rule_version', default: 'v1' })
  rule_version: string;

  @Column({ type: 'varchar', length: 160, name: 'dedupe_key', unique: true })
  dedupe_key: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'first_detected_at' })
  first_detected_at: Date;

  @Column({ type: 'timestamptz', name: 'last_detected_at' })
  last_detected_at: Date;

  @Column({ type: 'timestamptz', name: 'acknowledged_at', nullable: true })
  acknowledged_at: Date | null;

  @Column({ type: 'varchar', length: 128, name: 'acknowledged_by_admin_id', nullable: true })
  acknowledged_by_admin_id: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'varchar', length: 128, name: 'resolved_by_admin_id', nullable: true })
  resolved_by_admin_id: string | null;
}
