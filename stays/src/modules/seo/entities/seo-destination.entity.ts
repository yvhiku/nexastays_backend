import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('seo_destinations')
export class SeoDestination {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'char', length: 2, name: 'country_code', default: 'MA' })
  country_code: string;

  @Column({ type: 'varchar', length: 64, name: 'region_id', nullable: true })
  region_id: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number | null;

  @Column({ type: 'jsonb', name: 'bounds_json', nullable: true })
  bounds_json: Record<string, unknown> | null;

  @Column({ type: 'text', name: 'hero_image_url', nullable: true })
  hero_image_url: string | null;

  @Column({ type: 'text', name: 'best_time_to_visit', nullable: true })
  best_time_to_visit: string | null;

  @Column({ type: 'text', array: true, name: 'nearby_city_slugs', default: [] })
  nearby_city_slugs: string[];

  @Column({ type: 'jsonb', name: 'geo_blocks_json', default: [] })
  geo_blocks_json: unknown[];

  @Column({ type: 'jsonb', name: 'stats_cache_json', nullable: true })
  stats_cache_json: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'stats_refreshed_at', nullable: true })
  stats_refreshed_at: Date | null;

  @Column({ type: 'int', name: 'listing_count_cache', default: 0 })
  listing_count_cache: number;

  @Column({ type: 'int', name: 'seo_score', default: 0 })
  seo_score: number;

  @Column({ type: 'varchar', length: 20, name: 'content_status', default: 'published' })
  content_status: string;

  @Column({ type: 'boolean', default: false })
  indexable: boolean;

  @Column({ type: 'varchar', length: 120, name: 'search_city' })
  search_city: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
