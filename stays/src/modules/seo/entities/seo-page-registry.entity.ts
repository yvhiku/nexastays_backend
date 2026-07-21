import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SeoDestination } from './seo-destination.entity';

@Entity('seo_page_registry')
export class SeoPageRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, name: 'page_type' })
  page_type: string;

  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'char', length: 2 })
  locale: string;

  @Column({ type: 'varchar', length: 512 })
  path: string;

  @Column({ type: 'varchar', length: 20, default: 'published' })
  status: string;

  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0.8 })
  priority: number;

  @Column({ type: 'boolean', default: false })
  indexable: boolean;

  @Column({ type: 'int', name: 'seo_score', default: 0 })
  seo_score: number;

  @Column({ type: 'uuid', name: 'destination_id', nullable: true })
  destination_id: string | null;

  @ManyToOne(() => SeoDestination, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'destination_id' })
  destination: SeoDestination | null;

  @Column({ type: 'uuid', name: 'guide_id', nullable: true })
  guide_id: string | null;

  @Column({ type: 'timestamptz' })
  lastmod: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
