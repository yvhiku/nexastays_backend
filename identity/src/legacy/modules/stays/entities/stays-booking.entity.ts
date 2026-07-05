import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { StaysListing } from './stays-listing.entity';
import { StaysBookingOccupant } from './stays-booking-occupant.entity';

@Entity('stays_bookings')
export class StaysBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, (l) => l.bookings)
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'uuid', name: 'guest_user_id' })
  guest_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'guest_user_id' })
  guest: User;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'INITIATED',
  })
  status:
    | 'INITIATED'
    | 'PAYMENT_PENDING'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'COMPLETED'
    | 'CANCELLED_BY_GUEST'
    | 'CANCELLED_BY_HOST'
    | 'EXPIRED';

  @Column({ type: 'date', name: 'checkin_date' })
  checkin_date: Date;

  @Column({ type: 'date', name: 'checkout_date' })
  checkout_date: Date;

  @Column({ type: 'int', name: 'guest_count', default: 1 })
  guest_count: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_subtotal' })
  total_subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'guest_fee', default: 0 })
  guest_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'host_fee', default: 0 })
  host_fee: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_paid', nullable: true })
  total_paid: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'payout_amount', nullable: true })
  payout_amount: number | null;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  @Column({ type: 'varchar', length: 64, name: 'idempotency_key', nullable: true, unique: true })
  idempotency_key: string | null;

  @Column({ type: 'varchar', length: 128, name: 'payment_intent_id', nullable: true })
  payment_intent_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true })
  confirmed_at: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paid_at: Date | null;

  @OneToMany(() => StaysBookingOccupant, (o) => o.booking)
  occupants: StaysBookingOccupant[];
}
