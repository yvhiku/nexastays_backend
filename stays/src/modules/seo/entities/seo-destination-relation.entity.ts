import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeoDestination } from './seo-destination.entity';

export type SeoRelationType =
  | 'near'
  | 'similar'
  | 'beach_alternative'
  | 'luxury_alternative'
  | 'day_trip'
  | 'surf_alternative';

@Entity('seo_destination_relations')
export class SeoDestinationRelation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  from_destination_id: string;

  @ManyToOne(() => SeoDestination, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_destination_id' })
  from_destination: SeoDestination;

  @Column({ type: 'uuid' })
  to_destination_id: string;

  @ManyToOne(() => SeoDestination, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_destination_id' })
  to_destination: SeoDestination;

  @Column({ type: 'varchar', length: 32 })
  relation_type: SeoRelationType;

  @Column({ type: 'int', default: 50 })
  weight: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
