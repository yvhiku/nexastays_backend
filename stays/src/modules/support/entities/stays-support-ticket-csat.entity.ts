import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('stays_support_ticket_csat')
export class StaysSupportTicketCsat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ticket_id', unique: true })
  ticket_id: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'smallint', name: 'agent_rating', nullable: true })
  agent_rating: number | null;

  @Column({ type: 'varchar', length: 128, name: 'agent_id', nullable: true })
  agent_id: string | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'submitted_at' })
  submitted_at: Date;
}
