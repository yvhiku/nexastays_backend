import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  HostApplicationStatus,
  HostIdentityStatus,
  HostOnboardingSource,
} from '../hosts/host-onboarding.types';

@Entity('stays_host_profiles')
export class StaysHostProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'user_id' })
  user_id: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'host_verification_status',
    default: 'PENDING',
  })
  host_verification_status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({
    type: 'varchar',
    length: 20,
    name: 'application_status',
    default: 'DRAFT',
  })
  application_status: HostApplicationStatus;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'identity_status',
    default: 'NOT_STARTED',
  })
  identity_status: HostIdentityStatus;

  @Column({ type: 'varchar', length: 20, name: 'source', default: 'UNKNOWN' })
  source: HostOnboardingSource;

  @Column({ type: 'varchar', length: 64, name: 'submitted_from', nullable: true })
  submitted_from: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    name: 'sumsub_applicant_id',
    nullable: true,
  })
  sumsub_applicant_id: string | null;

  @Column({ type: 'varchar', length: 255, name: 'full_name', nullable: true })
  full_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 50, name: 'host_type', nullable: true })
  host_type: string | null;

  @Column({
    type: 'timestamptz',
    name: 'hosting_policies_accepted_at',
    nullable: true,
  })
  hosting_policies_accepted_at: Date | null;

  @Column({ type: 'boolean', name: 'identity_reused', default: false })
  identity_reused: boolean;

  @Column({ type: 'boolean', name: 'listing_frozen', default: false })
  listing_frozen: boolean;

  @Column({ type: 'varchar', length: 20, name: 'document_type', nullable: true })
  document_type: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    name: 'document_number_hash',
    nullable: true,
  })
  document_number_hash: string | null;

  @Column({ type: 'uuid', name: 'document_front_asset_id', nullable: true })
  document_front_asset_id: string | null;

  @Column({ type: 'uuid', name: 'document_back_asset_id', nullable: true })
  document_back_asset_id: string | null;

  @Column({ type: 'uuid', name: 'selfie_asset_id', nullable: true })
  selfie_asset_id: string | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'varchar', length: 100, name: 'reviewed_by', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejection_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
