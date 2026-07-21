import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysConversation } from './stays-conversation.entity';

export type MessageType =
  | 'TEXT'
  | 'SYSTEM_EVENT'
  | 'SYSTEM_NOTICE'
  | 'SYSTEM_INTERNAL'
  | 'PROPERTY_CARD'
  | 'BOOKING_CARD'
  | 'CHECKIN_CARD'
  | 'WIFI_CARD'
  | 'LOCATION_CARD'
  | 'REVIEW_CARD'
  | 'PAYMENT_CARD'
  | 'IMAGE'
  | 'FILE'
  | 'VIDEO'
  | 'VOICE'
  | 'LOCATION'
  | 'SYSTEM'
  | 'CARD'
  | 'CUSTOM';

export type MessageStatus = 'PENDING' | 'PERSISTED' | 'DELIVERED' | 'READ' | 'FAILED';

@Entity('stays_messages')
export class StaysMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversation_id: string;

  @ManyToOne(() => StaysConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: StaysConversation;

  @Column({ type: 'bigint', name: 'conversation_sequence' })
  conversation_sequence: string;

  @Column({ type: 'varchar', length: 128, name: 'sender_id', nullable: true })
  sender_id: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: MessageType;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'PERSISTED' })
  status: MessageStatus;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sent_at: Date | null;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  read_at: Date | null;

  @Column({ type: 'timestamptz', name: 'pushed_at', nullable: true })
  pushed_at: Date | null;

  @Column({ type: 'boolean', name: 'is_system', default: false })
  is_system: boolean;

  @Column({ type: 'uuid', name: 'client_message_id', nullable: true })
  client_message_id: string | null;

  @Column({ type: 'timestamptz', name: 'client_created_at', nullable: true })
  client_created_at: Date | null;

  @Column({ type: 'timestamptz', name: 'edited_at', nullable: true })
  edited_at: Date | null;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deleted_at: Date | null;

  @Column({ type: 'varchar', length: 128, name: 'deleted_by', nullable: true })
  deleted_by: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
