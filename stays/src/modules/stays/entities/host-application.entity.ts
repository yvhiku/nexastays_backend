import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('host_applications')
export class HostApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'applicant_user_id' })
  applicant_user_id: string;

  @Column({ type: 'varchar', length: 50, name: 'phone_number' })
  phone_number: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name', nullable: true })
  full_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'varchar', length: 100, name: 'reviewed_by', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'boolean', name: 'identity_reused', default: false })
  identity_reused: boolean;

  @Column({ type: 'timestamptz', name: 'hosting_policies_accepted_at', nullable: true })
  hosting_policies_accepted_at: Date | null;

  @Column({ type: 'boolean', name: 'payout_setup_completed', default: false })
  payout_setup_completed: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
