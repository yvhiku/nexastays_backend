import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SeoDestination } from './seo-destination.entity';

export type SeoGuideType = 'travel' | 'experience' | 'seasonal' | 'event';
export type SeoContentStatus = 'draft' | 'review' | 'published' | 'archived';

@Entity('seo_guides')
export class SeoGuide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'char', length: 2, default: 'en' })
  locale: string;

  @Column({ type: 'varchar', length: 32, default: 'travel' })
  guide_type: SeoGuideType;

  @Column({ type: 'uuid', nullable: true })
  destination_id: string | null;

  @ManyToOne(() => SeoDestination, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'destination_id' })
  destination: SeoDestination | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  seo_title: string | null;

  @Column({ type: 'text', nullable: true })
  seo_description: string | null;

  @Column({ type: 'text', nullable: true })
  body_html: string | null;

  @Column({ type: 'jsonb', default: [] })
  geo_blocks_json: { question: string; answer: string }[];

  @Column({ type: 'boolean', default: false })
  indexable: boolean;

  @Column({ type: 'int', default: 0 })
  seo_score: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  content_status: SeoContentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
