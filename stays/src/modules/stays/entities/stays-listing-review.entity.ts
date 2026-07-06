import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';
import { StaysBooking } from './stays-booking.entity';
import { StaysReviewMedia } from './stays-review-media.entity';

export type ReviewStatus = 'PUBLISHED' | 'HIDDEN' | 'REMOVED';

@Entity('stays_listing_reviews')
@Index(['listing_id', 'created_at'])
@Index(['listing_id', 'status'])
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

  @Column({ type: 'uuid', name: 'host_user_id', nullable: true })
  host_user_id: string | null;

  @Column({ type: 'decimal', precision: 2, scale: 1 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PUBLISHED' })
  status: ReviewStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'timestamptz', name: 'edited_at', nullable: true })
  edited_at: Date | null;

  @OneToMany(() => StaysReviewMedia, (m) => m.review)
  media: StaysReviewMedia[];
}
