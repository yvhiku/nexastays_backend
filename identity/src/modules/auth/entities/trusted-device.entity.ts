import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('trusted_devices')
@Index(['user_id', 'device_id'], { unique: true })
export class TrustedDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 120, name: 'device_id' })
  device_id: string;

  @Column({ type: 'varchar', length: 120, name: 'device_name', nullable: true })
  device_name: string | null;

  @Column({ type: 'boolean', default: false })
  trusted: boolean;

  @Column({ type: 'timestamptz', name: 'first_seen_at', nullable: true })
  first_seen_at: Date | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  last_seen_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
