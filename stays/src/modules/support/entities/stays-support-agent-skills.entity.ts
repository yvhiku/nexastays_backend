import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stays_support_agent_skills')
export class StaysSupportAgentSkills {
  @PrimaryColumn({ type: 'varchar', length: 128, name: 'agent_user_id' })
  agent_user_id: string;

  @Column({ type: 'text', array: true, default: '{}' })
  languages: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  categories: string[];

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
