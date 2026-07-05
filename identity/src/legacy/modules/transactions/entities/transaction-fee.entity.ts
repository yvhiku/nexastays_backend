import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AppTransaction } from './app-transaction.entity';

@Entity('transaction_fees')
export class TransactionFee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'app_transaction_id' })
  app_transaction_id: string;

  @ManyToOne(() => AppTransaction)
  @JoinColumn({ name: 'app_transaction_id' })
  app_transaction: AppTransaction;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
