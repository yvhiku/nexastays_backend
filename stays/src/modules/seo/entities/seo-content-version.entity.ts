import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ContentVersionStatus = 'draft' | 'review' | 'published' | 'archived';

@Entity('seo_content_versions')
export class SeoContentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  entity_type: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'char', length: 2 })
  locale: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 64 })
  field_name: string;

  @Column({ type: 'text', nullable: true })
  content_html: string | null;

  @Column({ type: 'jsonb', nullable: true })
  content_json: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ContentVersionStatus;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  approved_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;
}
