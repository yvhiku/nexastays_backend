import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const SECURITY_EVENT_TYPES = [
  'AUTH_FAILURE',
  'PIN_LOCKOUT',
  'DEVICE_ANOMALY',
  'FRAUD_FLAG',
  'SAR_CREATED',
  'CONSENT_UPDATED',
  'DATA_EXPORT_REQUESTED',
  'ACCOUNT_DELETION_REQUESTED',
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

@Entity('security_events')
@Index('idx_security_events_user_created_at', ['user_id', 'created_at'])
@Index('idx_security_events_type_created_at', ['event_type', 'created_at'])
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 40, name: 'event_type' })
  event_type: SecurityEventType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'ip_address' })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'device_id' })
  device_id: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
