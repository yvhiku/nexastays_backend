import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { StaysMessage } from './stays-message.entity';

@Entity('stays_message_attachments')
export class StaysMessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'message_id' })
  message_id: string;

  @ManyToOne(() => StaysMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: StaysMessage;

  @Column({ type: 'text', name: 'storage_url' })
  storage_url: string;

  @Column({ type: 'text', name: 'thumbnail_url', nullable: true })
  thumbnail_url: string | null;

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
