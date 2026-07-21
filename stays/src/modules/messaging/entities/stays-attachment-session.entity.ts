import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysConversation } from './stays-conversation.entity';

export type AttachmentSessionStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'READY'
  | 'COMPLETED'
  | 'ABANDONED';

@Entity('stays_attachment_sessions')
export class StaysAttachmentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversation_id: string;

  @ManyToOne(() => StaysConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: StaysConversation;

  @Column({ type: 'varchar', length: 128, name: 'owner_user_id' })
  owner_user_id: string;

  @Column({ type: 'varchar', length: 20, default: 'CREATED' })
  status: AttachmentSessionStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
