import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { LedgerTransaction } from '../../../ledger/entities/ledger-transaction.entity';

@Entity('delivery_transactions', { schema: 'go_delivery' })
@Index(['order_id'])
@Index(['ledger_transaction_id'])
export class DeliveryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'order_id' })
  order_id: string;

  @OneToOne(() => Order, (order) => order.transaction)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid', name: 'ledger_transaction_id' })
  ledger_transaction_id: string;

  @ManyToOne(() => LedgerTransaction)
  @JoinColumn({ name: 'ledger_transaction_id' })
  ledger_transaction: LedgerTransaction;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
