import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysBooking } from './stays-booking.entity';

@Entity('stays_ledger_entries')
export class StaysLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  booking_id: string;

  @ManyToOne(() => StaysBooking, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking: StaysBooking;

  @Column({
    type: 'varchar',
    length: 30,
  })
  type: 'GUEST_PAYMENT' | 'HOST_PAYOUT' | 'PLATFORM_FEE' | 'REFUND';

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  status: 'PENDING' | 'SETTLED' | 'FAILED';

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
