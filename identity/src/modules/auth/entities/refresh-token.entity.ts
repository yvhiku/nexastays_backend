import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'varchar', length: 128, name: 'token_hash' })
  token_hash: string;

  @Column({ type: 'varchar', length: 255, name: 'device_id', nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  user_agent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
