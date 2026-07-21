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
import { StaysAttachmentSession } from './stays-attachment-session.entity';
import { StaysMediaAsset } from './stays-media-asset.entity';

export type ProcessingStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
/** @deprecated use ProcessingStatus — DB column remains `status` */
export type AttachmentStatus = ProcessingStatus;

export type VirusScanStatus = 'PENDING' | 'SAFE' | 'FAILED';

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

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  session_id: string | null;

  @ManyToOne(() => StaysAttachmentSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'session_id' })
  session: StaysAttachmentSession | null;

  @Column({ type: 'uuid', name: 'media_asset_id', nullable: true })
  media_asset_id: string | null;

  @ManyToOne(() => StaysMediaAsset, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'media_asset_id' })
  media_asset: StaysMediaAsset | null;

  @Column({ type: 'int', name: 'media_version', default: 1 })
  media_version: number;

  /** Processing pipeline status (upload → process → ready) */
  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' })
  status: ProcessingStatus;

  @Column({ type: 'int', nullable: true })
  orientation: number | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'varchar', length: 64, name: 'checksum_sha256', nullable: true })
  checksum_sha256: string | null;

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
  virus_scan_status: VirusScanStatus;

  @Column({ type: 'bigint', name: 'size_bytes', nullable: true })
  size_bytes: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;
}
