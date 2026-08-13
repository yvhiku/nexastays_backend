import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type SupportTicketParty = 'GUEST' | 'HOST';

export type SupportTicketCategory =
  | 'BOOKING'
  | 'PAYMENT'
  | 'REFUND'
  | 'CANCELLATION'
  | 'HOST'
  | 'GUEST'
  | 'LISTING'
  | 'KYC'
  | 'TECHNICAL'
  | 'FRAUD'
  | 'OTHER';

export type SupportTicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_CUSTOMER'
  | 'WAITING_FOR_HOST'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

@Entity('stays_support_tickets')
export class StaysSupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, name: 'ticket_number', unique: true })
  ticket_number: string;

  @Index()
  @Column({ type: 'varchar', length: 128, name: 'requester_user_id' })
  requester_user_id: string;

  @Column({ type: 'varchar', length: 10 })
  party: SupportTicketParty;

  @Column({ type: 'varchar', length: 32 })
  category: SupportTicketCategory;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status: SupportTicketStatus;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  priority: SupportTicketPriority;

  @Column({ type: 'varchar', length: 128, name: 'assigned_admin_id', nullable: true })
  assigned_admin_id: string | null;

  @Column({ type: 'uuid', name: 'conversation_id', unique: true })
  conversation_id: string;

  @Column({ type: 'uuid', name: 'booking_id', nullable: true })
  booking_id: string | null;

  @Column({ type: 'uuid', name: 'listing_id', nullable: true })
  listing_id: string | null;

  @Column({ type: 'uuid', name: 'report_id', nullable: true })
  report_id: string | null;

  @Column({ type: 'uuid', name: 'safety_issue_id', nullable: true })
  safety_issue_id: string | null;

  @Column({ type: 'boolean', name: 'unread_for_support', default: true })
  unread_for_support: boolean;

  @Column({ type: 'text', name: 'last_message_preview', nullable: true })
  last_message_preview: string | null;

  @Column({ type: 'varchar', length: 256, name: 'customer_name', nullable: true })
  customer_name: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolved_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
