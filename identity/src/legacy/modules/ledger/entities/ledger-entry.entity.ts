import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LedgerTransaction } from './ledger-transaction.entity';
import { LedgerAccount } from './ledger-account.entity';

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'transaction_id' })
  transaction_id: string;

  @ManyToOne(() => LedgerTransaction, (transaction) => transaction.entries)
  @JoinColumn({ name: 'transaction_id' })
  transaction: LedgerTransaction;

  @Column({ type: 'uuid', name: 'account_id' })
  account_id: string;

  @ManyToOne(() => LedgerAccount, (account) => account.entries)
  @JoinColumn({ name: 'account_id' })
  account: LedgerAccount;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({
    type: 'varchar',
    length: 6,
    name: 'entry_type',
    enum: EntryType,
  })
  entry_type: EntryType;

  @Column({ type: 'smallint', nullable: true, name: 'line_number' })
  line_number: number | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
