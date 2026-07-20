import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

@Entity('stays_messaging_outbox')
export class StaysMessagingOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', name: 'next_retry_at', default: () => 'NOW()' })
  next_retry_at: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processed_at: Date | null;
}
