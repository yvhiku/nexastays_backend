import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('stays_support_ticket_viewers')
export class StaysSupportTicketViewer {
  @PrimaryColumn({ type: 'uuid', name: 'ticket_id' })
  ticket_id: string;

  @PrimaryColumn({ type: 'varchar', length: 128, name: 'viewer_id' })
  viewer_id: string;

  @Column({ type: 'timestamptz', name: 'last_seen_at' })
  last_seen_at: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at: Date;

  @Column({ type: 'timestamptz', name: 'last_activity_at', nullable: true })
  last_activity_at: Date | null;

  @Column({ type: 'varchar', length: 16, name: 'activity_state', default: 'VIEWING' })
  activity_state: 'VIEWING' | 'HANDLING';
}
