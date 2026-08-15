import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('stays_support_agent_coaching_notes')
@Index('idx_stays_support_coaching_agent_created', ['agent_user_id', 'created_at'])
export class StaysSupportAgentCoachingNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, name: 'agent_user_id' })
  agent_user_id: string;

  @Column({ type: 'varchar', length: 128, name: 'created_by' })
  created_by: string;

  @Column({ type: 'text' })
  note: string;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: 'OPEN' | 'COMPLETED';

  @Column({ type: 'timestamptz', name: 'follow_up_at', nullable: true })
  follow_up_at: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'varchar', length: 128, name: 'completed_by', nullable: true })
  completed_by: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
