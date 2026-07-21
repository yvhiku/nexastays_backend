import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeoDestination } from './seo-destination.entity';

@Entity('seo_landmarks')
export class SeoLandmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 96, unique: true })
  url_slug: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  destination_id: string | null;

  @ManyToOne(() => SeoDestination, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'destination_id' })
  destination: SeoDestination | null;

  @Column({ type: 'varchar', length: 120 })
  search_city: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8 })
  longitude: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 2.0 })
  radius_km: number;

  @Column({ type: 'int', default: 50 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
