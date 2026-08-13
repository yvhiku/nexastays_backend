import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('stays_support_ticket_notes')
@Index('idx_stays_support_ticket_notes_ticket_created', [
  'ticket_id',
  'created_at',
  'id',
])
export class StaysSupportTicketNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'ticket_id' })
  ticket_id: string;

  @Column({ type: 'varchar', length: 128, name: 'author_admin_id' })
  author_admin_id: string;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
