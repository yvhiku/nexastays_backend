import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TransactionFee } from './transaction-fee.entity';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';

@Entity('app_transactions')
export class AppTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'sender_user_id' })
  sender_user_id: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_user_id' })
  sender_user: User;

  @Column({ type: 'uuid', nullable: true, name: 'ledger_transaction_id' })
  ledger_transaction_id: string | null;

  @ManyToOne(() => LedgerTransaction, { nullable: true })
  @JoinColumn({ name: 'ledger_transaction_id' })
  ledger_transaction: LedgerTransaction | null;

  @Column({ type: 'uuid', nullable: true, name: 'receiver_user_id' })
  receiver_user_id: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'receiver_user_id' })
  receiver_user: User;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  idempotency_key: string | null;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToOne(() => TransactionFee, (fee) => fee.app_transaction, {
    nullable: true,
  })
  fee: TransactionFee;
}
