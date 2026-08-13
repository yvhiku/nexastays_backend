import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stays_support_canned_replies')
export class StaysSupportCannedReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 128, name: 'created_by_admin_id' })
  created_by_admin_id: string;

  @Column({ type: 'varchar', length: 128, name: 'updated_by_admin_id', nullable: true })
  updated_by_admin_id: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active: boolean;
}
