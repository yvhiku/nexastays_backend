import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fraud_events')
export class FraudEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 30, name: 'transaction_type' })
  transaction_type: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'int', name: 'risk_score' })
  risk_score: number;

  @Column({ type: 'varchar', length: 80, name: 'reason_code' })
  reason_code: string;

  @Column({ type: 'varchar', length: 10 })
  severity: string;

  @Column({ type: 'varchar', length: 20 })
  action: string;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'assigned_owner' })
  assigned_owner: string | null;

  @Column({ type: 'text', nullable: true, name: 'internal_note' })
  internal_note: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
