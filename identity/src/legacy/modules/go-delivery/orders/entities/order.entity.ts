import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Merchant } from '../../merchants/entities/merchant.entity';
import { OrderStatus } from '../../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { DeliveryEvent } from './delivery-event.entity';
import { DeliveryTransaction } from '../../payouts/entities/delivery-transaction.entity';

@Entity('orders', { schema: 'go_delivery' })
@Index(['customer_id'])
@Index(['merchant_id'])
@Index(['courier_id'])
@Index(['status'])
@Index(['created_at'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customer_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @Column({ type: 'uuid', name: 'merchant_id' })
  merchant_id: string;

  @ManyToOne(() => Merchant, (merchant) => merchant.orders)
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column({ type: 'uuid', nullable: true, name: 'courier_id' })
  courier_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'courier_id' })
  courier: User | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.CREATED,
  })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'delivery_fee' })
  delivery_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'platform_fee' })
  platform_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_amount' })
  total_amount: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completed_at: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToMany(() => DeliveryEvent, (event) => event.order)
  events: DeliveryEvent[];

  @OneToOne(() => DeliveryTransaction, (transaction) => transaction.order)
  transaction: DeliveryTransaction | null;
}
