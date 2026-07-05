import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { StaysListing } from './stays-listing.entity';
import { StaysBooking } from './stays-booking.entity';

@Entity('stays_listing_reviews')
@Index(['listing_id', 'created_at'])
export class StaysListingReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'uuid', name: 'booking_id', unique: true })
  booking_id: string;

  @ManyToOne(() => StaysBooking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking: StaysBooking;

  @Column({ type: 'uuid', name: 'guest_user_id' })
  guest_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'guest_user_id' })
  guest: User;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
