import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('stays_audit_logs')
export class StaysAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actor_user_id: string | null;

  @Column({ type: 'varchar', length: 30, name: 'actor_role', nullable: true })
  actor_role: string | null;

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entity_type: string;

  @Column({ type: 'varchar', length: 128, name: 'entity_id', nullable: true })
  entity_id: string | null;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  user_agent: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
