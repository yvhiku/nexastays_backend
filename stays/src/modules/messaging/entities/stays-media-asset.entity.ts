import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('stays_media_assets')
export class StaysMediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'storage_key' })
  storage_key: string;

  @Column({ type: 'varchar', length: 64, name: 'checksum_sha256', nullable: true })
  checksum_sha256: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mime: string | null;

  @Column({ type: 'bigint', name: 'size_bytes', nullable: true })
  size_bytes: string | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'int', nullable: true })
  orientation: number | null;

  @Column({ type: 'text', name: 'thumbnail_storage_key', nullable: true })
  thumbnail_storage_key: string | null;

  @Column({ type: 'uuid', name: 'encryption_key_id', nullable: true })
  encryption_key_id: string | null;

  @Column({ type: 'int', name: 'media_version', default: 1 })
  media_version: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
