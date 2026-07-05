import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sar_reports')
export class SarReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'uuid', name: 'transaction_id', nullable: true })
  transaction_id: string | null;

  @Column({ type: 'varchar', length: 120, name: 'risk_reason' })
  risk_reason: string;

  @Column({ type: 'int', name: 'risk_score' })
  risk_score: number;

  @Column({ type: 'jsonb', name: 'device_context', nullable: true })
  device_context: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'report_payload' })
  report_payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
