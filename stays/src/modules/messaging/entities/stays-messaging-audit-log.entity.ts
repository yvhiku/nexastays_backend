import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('stays_messaging_audit_log')
export class StaysMessagingAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id', nullable: true })
  conversation_id: string | null;

  @Column({ type: 'varchar', length: 128, name: 'actor_user_id', nullable: true })
  actor_user_id: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
