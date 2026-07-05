import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LedgerEntry } from './ledger-entry.entity';

@Entity('ledger_transactions')
export class LedgerTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
    name: 'idempotency_key',
  })
  idempotency_key: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: object | null;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'reverses_ledger_transaction_id',
  })
  reverses_ledger_transaction_id: string | null;

  @Column({
    type: 'char',
    length: 64,
    nullable: true,
    name: 'idempotency_payload_hash',
  })
  idempotency_payload_hash: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => LedgerTransaction, { nullable: true })
  @JoinColumn({ name: 'reverses_ledger_transaction_id' })
  reverses_ledger_transaction: LedgerTransaction | null;

  @OneToMany(() => LedgerEntry, (entry) => entry.transaction)
  entries: LedgerEntry[];
}
