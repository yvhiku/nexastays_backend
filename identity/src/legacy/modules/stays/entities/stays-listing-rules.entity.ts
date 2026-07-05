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

@Entity('stays_listing_rules')
export class StaysListingRules {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'listing_id' })
  listing_id: string;

  @OneToOne(() => StaysListing, (l) => l.rules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'varchar', length: 30, name: 'pets_policy', nullable: true })
  pets_policy: 'ALLOWED' | 'DOGS_CATS' | 'NO' | null;

  @Column({ type: 'varchar', length: 20, name: 'smoking_policy', nullable: true })
  smoking_policy: 'ALLOWED' | 'NOT_ALLOWED' | null;

  @Column({ type: 'boolean', name: 'quiet_hours', default: false })
  quiet_hours: boolean;

  @Column({ type: 'boolean', name: 'couples_welcome', default: true })
  couples_welcome: boolean;

  @Column({ type: 'int', name: 'max_guests', default: 4 })
  max_guests: number;

  @Column({ type: 'jsonb', default: [] })
  amenities: string[];

  @Column({ type: 'text', name: 'extra_rules_text', nullable: true })
  extra_rules_text: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'cancellation_policy',
    default: 'MODERATE',
  })
  cancellation_policy: 'FLEXIBLE' | 'MODERATE' | 'STRICT';

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
