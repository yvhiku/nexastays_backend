import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';
import { StaysListingUnitType } from './stays-listing-unit-type.entity';

@Entity('stays_listing_media')
export class StaysListingMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, (l) => l.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'varchar', length: 20 })
  kind: 'PHOTO' | 'VIDEO' | 'WALKTHROUGH';

  @Column({ type: 'uuid', name: 'asset_id' })
  asset_id: string;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', name: 'is_required', default: false })
  is_required: boolean;

  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  @Column({ type: 'uuid', name: 'unit_type_id', nullable: true })
  unit_type_id: string | null;

  @ManyToOne(() => StaysListingUnitType, (u) => u.media, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'unit_type_id' })
  unit_type: StaysListingUnitType | null;

  @Column({ type: 'boolean', name: 'is_cover', default: false })
  is_cover: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
