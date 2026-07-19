import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { StaysListingRules } from './stays-listing-rules.entity';
import { StaysListingMedia } from './stays-listing-media.entity';
import { StaysRatePlan } from './stays-rate-plan.entity';
import { StaysCheckInContact } from './stays-check-in-contact.entity';
import { StaysBooking } from './stays-booking.entity';
import { StaysListingUnitType } from './stays-listing-unit-type.entity';

export type ListingBookingModel =
  | 'ENTIRE_PROPERTY'
  | 'PRIVATE_ROOM'
  | 'MULTI_UNIT'
  | 'ROOM_TYPES'
  | 'DORM_BEDS'
  | 'PRIVATE_ROOMS'
  | 'DORM_AND_PRIVATE'
  | 'BOTH';

@Entity('stays_listings')
export class StaysListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'host_user_id' })
  host_user_id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'listing_type',
  })
  listing_type: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';

  @Column({
    type: 'varchar',
    length: 30,
    name: 'booking_model',
    nullable: true,
  })
  booking_model: ListingBookingModel | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 2, default: 'MA' })
  country: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  neighborhood: string | null;

  @Column({ type: 'varchar', length: 20, name: 'postal_code', nullable: true })
  postal_code: string | null;

  @Column({ type: 'varchar', length: 120, name: 'building_name', nullable: true })
  building_name: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  landmark: string | null;

  @Column({ type: 'text', name: 'address_encrypted', nullable: true })
  address_encrypted: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, name: 'geo_lat', nullable: true })
  geo_lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, name: 'geo_lng', nullable: true })
  geo_lng: number | null;

  @Column({ type: 'jsonb', name: 'property_details', default: () => "'{}'" })
  property_details: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'safety_features', default: () => "'{}'" })
  safety_features: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  policies: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'DRAFT',
  })
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'LIVE' | 'PAUSED';

  @Column({ type: 'time', name: 'checkin_time', default: '14:00' })
  checkin_time: string;

  @Column({ type: 'time', name: 'checkout_time', default: '11:00' })
  checkout_time: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'instant_booking', default: false })
  instant_booking: boolean;

  @Column({
    type: 'timestamptz',
    name: 'last_edited_at',
    default: () => 'NOW()',
  })
  last_edited_at: Date;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archived_at: Date | null;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 2,
    name: 'avg_rating',
    nullable: true,
  })
  avg_rating: number | null;

  @Column({ type: 'int', name: 'review_count', default: 0 })
  review_count: number;

  @Column({ type: 'int', name: 'ratings_1', default: 0 })
  ratings_1: number;

  @Column({ type: 'int', name: 'ratings_2', default: 0 })
  ratings_2: number;

  @Column({ type: 'int', name: 'ratings_3', default: 0 })
  ratings_3: number;

  @Column({ type: 'int', name: 'ratings_4', default: 0 })
  ratings_4: number;

  @Column({ type: 'int', name: 'ratings_5', default: 0 })
  ratings_5: number;

  /** Opaque token for public ICS export URL — never derived from listing id */
  @Column({ type: 'uuid', name: 'calendar_export_token', nullable: true })
  calendar_export_token: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => StaysListingRules, (rules) => rules.listing, { cascade: true })
  rules: StaysListingRules | null;

  @OneToMany(() => StaysListingMedia, (m) => m.listing)
  media: StaysListingMedia[];

  @OneToMany(() => StaysListingUnitType, (u) => u.listing)
  unit_types: StaysListingUnitType[];

  @OneToOne(() => StaysRatePlan, (rp) => rp.listing, { cascade: true })
  rate_plan: StaysRatePlan | null;

  @OneToOne(() => StaysCheckInContact, (c) => c.listing, { cascade: true })
  check_in_contact: StaysCheckInContact | null;

  @OneToMany(() => StaysBooking, (b) => b.listing)
  bookings: StaysBooking[];
}
