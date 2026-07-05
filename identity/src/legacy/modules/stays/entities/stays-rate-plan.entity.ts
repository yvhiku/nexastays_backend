import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';

@Entity('stays_rate_plans')
export class StaysRatePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'listing_id' })
  listing_id: string;

  @OneToOne(() => StaysListing, (l) => l.rate_plan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'char', length: 3, default: 'MAD' })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'base_price' })
  base_price: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'weekend_price', nullable: true })
  weekend_price: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'cleaning_fee', default: 0 })
  cleaning_fee: number;

  @Column({ type: 'text', name: 'deposit_policy_text', nullable: true })
  deposit_policy_text: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
