import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';
import { StaysListingMedia } from './stays-listing-media.entity';

export type UnitTypeKind =
  | 'APARTMENT_UNIT'
  | 'HOTEL_ROOM'
  | 'RIAD_ROOM'
  | 'HOSTEL_DORM'
  | 'HOSTEL_PRIVATE'
  | 'VILLA_UNIT';

export type UnitPricingUnit = 'NIGHT' | 'BED_NIGHT' | 'ROOM_NIGHT';

@Entity('stays_listing_unit_types')
export class StaysListingUnitType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id: string;

  @ManyToOne(() => StaysListing, (l) => l.unit_types, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'varchar', length: 30 })
  kind: UnitTypeKind;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'int', name: 'max_guests', default: 2 })
  max_guests: number;

  @Column({ type: 'jsonb', name: 'bed_config', default: () => "'[]'" })
  bed_config: unknown[];

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    name: 'size_sqm',
    nullable: true,
  })
  size_sqm: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  amenities: string[];

  @Column({ type: 'varchar', length: 20, name: 'pricing_unit', default: 'NIGHT' })
  pricing_unit: UnitPricingUnit;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'base_price', default: 0 })
  base_price: number;

  @Column({ type: 'varchar', length: 3, default: 'MAD' })
  currency: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, unknown>;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => StaysListingMedia, (m) => m.unit_type)
  media: StaysListingMedia[];
}
