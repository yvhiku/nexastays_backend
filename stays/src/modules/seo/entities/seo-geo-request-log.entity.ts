import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('seo_geo_request_log')
export class SeoGeoRequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  endpoint: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  page_slug: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  locale: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'text', nullable: true })
  referrer: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  requested_at: Date;
}
