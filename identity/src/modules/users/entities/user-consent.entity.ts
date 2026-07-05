import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user_consents')
@Index(['user_id', 'consent_type', 'created_at'])
export class UserConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 40, name: 'consent_type' })
  consent_type: 'TERMS' | 'PRIVACY' | 'MARKETING';

  @Column({ type: 'varchar', length: 40 })
  version: string;

  @Column({ type: 'boolean', default: true })
  granted: boolean;

  @Column({ type: 'timestamptz', name: 'accepted_at' })
  accepted_at: Date;

  @Column({ type: 'varchar', length: 60, name: 'ip_address', nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 120, name: 'device_id', nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  language: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
