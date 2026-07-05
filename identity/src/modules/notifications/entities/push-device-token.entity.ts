import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('push_device_tokens')
@Index(['user_id', 'device_id'], { unique: true })
export class PushDeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 120, name: 'device_id' })
  device_id: string;

  @Column({ type: 'varchar', length: 512 })
  token: string;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  platform: string;

  @Column({ type: 'boolean', name: 'notifications_enabled', default: true })
  notifications_enabled: boolean;

  @Column({ type: 'boolean', name: 'active', default: true })
  active: boolean;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  last_seen_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
