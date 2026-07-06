import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { StaysListingReview } from './stays-listing-review.entity';

@Entity('stays_review_media')
@Index(['review_id', 'display_order'])
export class StaysReviewMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'review_id' })
  review_id: string;

  @ManyToOne(() => StaysListingReview, (r) => r.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: StaysListingReview;

  @Column({ type: 'uuid', name: 'asset_id' })
  asset_id: string;

  @Column({ type: 'smallint', name: 'display_order', default: 0 })
  display_order: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
