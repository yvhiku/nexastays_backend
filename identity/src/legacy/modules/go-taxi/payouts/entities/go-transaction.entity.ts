import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Ride } from '../../rides/entities/ride.entity';
import { LedgerTransaction } from '../../../ledger/entities/ledger-transaction.entity';
import { GoTransactionStatus } from '../../enums/go-transaction-status.enum';

@Entity('go_transactions', { schema: 'go' })
@Index(['ride_id'])
@Index(['ledger_transaction_id'])
@Index(['status'])
export class GoTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'ride_id' })
  ride_id: string;

  @OneToOne(() => Ride, (ride) => ride.transaction)
  @JoinColumn({ name: 'ride_id' })
  ride: Ride;

  @Column({ type: 'uuid', name: 'ledger_transaction_id' })
  ledger_transaction_id: string;

  @ManyToOne(() => LedgerTransaction)
  @JoinColumn({ name: 'ledger_transaction_id' })
  ledger_transaction: LedgerTransaction;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'service_fee' })
  service_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'driver_earnings' })
  driver_earnings: number;

  @Column({
    type: 'enum',
    enum: GoTransactionStatus,
    default: GoTransactionStatus.PENDING,
  })
  status: GoTransactionStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
