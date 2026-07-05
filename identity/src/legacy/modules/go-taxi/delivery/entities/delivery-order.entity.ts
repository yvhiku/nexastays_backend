import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('delivery_orders')
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'customer_user_id' })
  customer_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_user_id' })
  customer_user: User;

  @Column({ type: 'uuid', name: 'merchant_user_id' })
  merchant_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'merchant_user_id' })
  merchant_user: User;

  @Column({ type: 'uuid', name: 'courier_user_id', nullable: true })
  courier_user_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'courier_user_id' })
  courier_user: User | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: OrderStatus.CREATED,
  })
  status: OrderStatus;

  // Order amounts
  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'subtotal' })
  subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'delivery_fee' })
  delivery_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_amount' })
  total_amount: number;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  // Location data
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'pickup_lat',
    nullable: true,
  })
  pickup_lat: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'pickup_lng',
    nullable: true,
  })
  pickup_lng: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'pickup_address',
    nullable: true,
  })
  pickup_address: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'delivery_lat',
    nullable: true,
  })
  delivery_lat: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'delivery_lng',
    nullable: true,
  })
  delivery_lng: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'delivery_address',
    nullable: true,
  })
  delivery_address: string | null;

  // Customer contact
  @Column({
    type: 'varchar',
    length: 20,
    name: 'customer_phone',
    nullable: true,
  })
  customer_phone: string | null;

  // Timestamps
  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'timestamp', name: 'prepared_at', nullable: true })
  prepared_at: Date | null;

  @Column({ type: 'timestamp', name: 'ready_at', nullable: true })
  ready_at: Date | null;

  @Column({ type: 'timestamp', name: 'picked_up_at', nullable: true })
  picked_up_at: Date | null;

  @Column({ type: 'timestamp', name: 'delivered_at', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', name: 'cancelled_at', nullable: true })
  cancelled_at: Date | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'cancellation_reason',
    nullable: true,
  })
  cancellation_reason: string | null;
}
