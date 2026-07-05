import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysBooking } from './stays-booking.entity';

@Entity('stays_booking_occupants')
export class StaysBookingOccupant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id' })
  booking_id: string;

  @ManyToOne(() => StaysBooking, (b) => b.occupants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: StaysBooking;

  @Column({ type: 'varchar', length: 100, name: 'full_name' })
  full_name: string;

  @Column({ type: 'varchar', length: 64, name: 'id_number', nullable: true })
  id_number: string | null;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  is_primary: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 128, name: 'id_document_front_asset_id', nullable: true })
  id_document_front_asset_id: string | null;

  @Column({ type: 'varchar', length: 128, name: 'id_document_back_asset_id', nullable: true })
  id_document_back_asset_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
