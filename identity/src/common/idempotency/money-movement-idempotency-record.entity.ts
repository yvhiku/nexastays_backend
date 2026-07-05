import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MoneyMovementScope } from './money-movement-scope';
import { MoneyMovementIdempotencyStatus } from './money-movement-idempotency-status';

@Entity('money_movement_idempotency')
@Index(['scope', 'actor_user_id', 'idempotency_key'], { unique: true })
@Index(['expires_at'])
export class MoneyMovementIdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 48 })
  scope: MoneyMovementScope;

  @Column({ type: 'uuid', name: 'actor_user_id' })
  actor_user_id: string;

  @Column({ type: 'varchar', length: 128, name: 'idempotency_key' })
  idempotency_key: string;

  @Column({ type: 'char', length: 64, name: 'request_hash' })
  request_hash: string;

  @Column({ type: 'varchar', length: 24 })
  status: MoneyMovementIdempotencyStatus;

  @Column({ type: 'smallint', name: 'response_contract_version', nullable: true })
  response_contract_version: number | null;

  @Column({ type: 'int', name: 'http_status', nullable: true })
  http_status: number | null;

  @Column({ type: 'jsonb', name: 'response_json', nullable: true })
  response_json: Record<string, unknown> | null;

  @Column({ type: 'jsonb', name: 'error_json', nullable: true })
  error_json: Record<string, unknown> | null;

  @Column({ type: 'uuid', name: 'ledger_transaction_id', nullable: true })
  ledger_transaction_id: string | null;

  @Column({ type: 'uuid', name: 'app_transaction_id', nullable: true })
  app_transaction_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at: Date;
}
