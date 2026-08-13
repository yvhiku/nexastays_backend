import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stays_conversation_reports')
export class StaysConversationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversation_id: string;

  @Column({ type: 'varchar', length: 128, name: 'reporter_user_id' })
  reporter_user_id: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', name: 'attachment_ids', default: [] })
  attachment_ids: string[];

  @Column({ type: 'varchar', length: 32, default: 'open' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
