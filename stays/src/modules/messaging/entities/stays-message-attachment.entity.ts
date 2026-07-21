import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysMessage } from './stays-message.entity';
import { StaysConversation } from './stays-conversation.entity';

export type AttachmentStatus = 'PROCESSING' | 'READY' | 'FAILED';

@Entity('stays_message_attachments')
export class StaysMessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'message_id', nullable: true })
  message_id: string | null;

  @ManyToOne(() => StaysMessage, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'message_id' })
  message: StaysMessage | null;

  @Column({ type: 'uuid', name: 'conversation_id', nullable: true })
  conversation_id: string | null;

  @ManyToOne(() => StaysConversation, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation: StaysConversation | null;

  @Column({ type: 'uuid', name: 'uploader_user_id', nullable: true })
  uploader_user_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' })
  status: AttachmentStatus;

  @Column({ type: 'text', name: 'storage_url' })
  storage_url: string;

  @Column({ type: 'text', name: 'thumbnail_url', nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'text', name: 'original_filename', nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mime: string | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  blurhash: string | null;

  @Column({ type: 'varchar', length: 20, name: 'virus_scan_status', default: 'PENDING' })
  virus_scan_status: string;

  @Column({ type: 'bigint', name: 'size_bytes', nullable: true })
  size_bytes: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
