import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysBooking } from './stays-booking.entity';

@Entity('stays_payment_intents')
export class StaysPaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  booking_id: string;

  @ManyToOne(() => StaysBooking, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking: StaysBooking;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 256, name: 'provider_intent_id', nullable: true })
  provider_intent_id: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'PENDING',
  })
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

  @Column({ type: 'varchar', length: 64, name: 'idempotency_key', nullable: true })
  idempotency_key: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
