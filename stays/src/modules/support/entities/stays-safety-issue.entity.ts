import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stays_safety_issues')
export class StaysSafetyIssue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversation_id: string;

  @Column({ type: 'varchar', length: 128, name: 'reporter_user_id' })
  reporter_user_id: string;

  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ type: 'jsonb', name: 'attachment_ids', default: [] })
  attachment_ids: string[];

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status: string;

  @Column({ type: 'uuid', name: 'booking_id', nullable: true })
  booking_id: string | null;

  @Column({ type: 'uuid', name: 'listing_id', nullable: true })
  listing_id: string | null;

  @Column({ type: 'varchar', length: 128, name: 'reported_user_id', nullable: true })
  reported_user_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
