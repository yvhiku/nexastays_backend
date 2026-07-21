import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { StaysMessage } from './stays-message.entity';

export type ConversationType = 'BOOKING' | 'SUPPORT' | 'SYSTEM';
export type MessagingState = 'ACTIVE' | 'LOCKED' | 'READ_ONLY' | 'ARCHIVED';
export type ParticipantVisibility = 'ACTIVE' | 'ARCHIVED' | 'DELETED';
export type NotificationLevel = 'ALL' | 'IMPORTANT' | 'MUTED';

@Entity('stays_conversations')
export class StaysConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'booking_id', unique: true, nullable: true })
  booking_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'BOOKING' })
  type: ConversationType;

  @Column({ type: 'varchar', length: 20, name: 'messaging_state', default: 'ACTIVE' })
  messaging_state: MessagingState;

  @Column({ type: 'varchar', length: 20, name: 'guest_visibility', default: 'ACTIVE' })
  guest_visibility: ParticipantVisibility;

  @Column({ type: 'varchar', length: 20, name: 'host_visibility', default: 'ACTIVE' })
  host_visibility: ParticipantVisibility;

  @Column({ type: 'int', name: 'conversation_version', default: 1 })
  conversation_version: number;

  @Column({ type: 'int', name: 'snapshot_version', default: 1 })
  snapshot_version: number;

  @Column({ type: 'int', name: 'attachment_version', default: 1 })
  attachment_version: number;

  @Column({ type: 'jsonb', name: 'reservation_snapshot', default: {} })
  reservation_snapshot: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'listing_id', nullable: true })
  listing_id: string | null;

  @Column({ type: 'varchar', length: 128, name: 'host_user_id', nullable: true })
  host_user_id: string | null;

  @Column({ type: 'varchar', length: 128, name: 'guest_user_id', nullable: true })
  guest_user_id: string | null;

  @Column({ type: 'uuid', name: 'last_message_id', nullable: true })
  last_message_id: string | null;

  @Column({ type: 'bigint', name: 'last_message_sequence', default: 0 })
  last_message_sequence: string;

  @Column({ type: 'text', name: 'last_message_preview', nullable: true })
  last_message_preview: string | null;

  @Column({ type: 'timestamptz', name: 'last_message_at', nullable: true })
  last_message_at: Date | null;

  @Column({ type: 'timestamptz', name: 'guest_last_read_at', nullable: true })
  guest_last_read_at: Date | null;

  @Column({ type: 'timestamptz', name: 'host_last_read_at', nullable: true })
  host_last_read_at: Date | null;

  @Column({ type: 'uuid', name: 'guest_last_read_message_id', nullable: true })
  guest_last_read_message_id: string | null;

  @Column({ type: 'uuid', name: 'host_last_read_message_id', nullable: true })
  host_last_read_message_id: string | null;

  @Column({ type: 'int', name: 'unread_guest', default: 0 })
  unread_guest: number;

  @Column({ type: 'int', name: 'unread_host', default: 0 })
  unread_host: number;

  @Column({ type: 'varchar', length: 20, name: 'notification_level_guest', default: 'ALL' })
  notification_level_guest: NotificationLevel;

  @Column({ type: 'varchar', length: 20, name: 'notification_level_host', default: 'ALL' })
  notification_level_host: NotificationLevel;

  @Column({ type: 'boolean', name: 'blocked_by_guest', default: false })
  blocked_by_guest: boolean;

  @Column({ type: 'boolean', name: 'blocked_by_host', default: false })
  blocked_by_host: boolean;

  @Column({ type: 'timestamptz', name: 'locked_at', nullable: true })
  locked_at: Date | null;

  @Column({ type: 'timestamptz', name: 'read_only_at', nullable: true })
  read_only_at: Date | null;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archived_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => StaysMessage, (m) => m.conversation)
  messages: StaysMessage[];
}
