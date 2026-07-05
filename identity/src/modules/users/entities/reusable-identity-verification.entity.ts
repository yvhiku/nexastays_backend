import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UnifiedIdentity } from './unified-identity.entity';

/**
 * Reusable Identity Verification – ecosystem-level KYC that can be reused across Nexa services.
 * Only VERIFIED status, non-expired documents are eligible for reuse.
 * Driver-specific compliance (vehicle, license) remains separate.
 */
@Entity('reusable_identity_verifications')
export class ReusableIdentityVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'unified_identity_id' })
  unified_identity_id: string;

  @ManyToOne(() => UnifiedIdentity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'unified_identity_id' })
  unified_identity: UnifiedIdentity;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kyc_provider' })
  kyc_provider: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'verification_reference' })
  verification_reference: string | null;

  /**
   * Reusable verification artifact status.
   * @see backend/docs/kyc-onboarding-status-domains.md
   */
  @Column({
    type: 'varchar',
    length: 30,
    default: 'PENDING',
    name: 'verification_status',
  })
  verification_status: string;

  /** @deprecated Use verification_status. VERIFIED = APPROVED (reusable). */
  @Column({ type: 'varchar', length: 20, default: 'PENDING', name: 'kyc_status' })
  kyc_status: string;

  @Column({ type: 'boolean', default: false, name: 'identity_verified' })
  identity_verified: boolean;

  /** e.g. LEVEL_1, LEVEL_2, FULL */
  @Column({ type: 'varchar', length: 30, nullable: true, name: 'verification_level' })
  verification_level: string | null;

  /** e.g. NATIONAL_ID, PASSPORT */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'document_type' })
  document_type: string | null;

  /** Masked for display: ****1234 */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'document_number_masked' })
  document_number_masked: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'first_verified_at' })
  first_verified_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_verified_at' })
  last_verified_at: Date | null;

  /** Document expiry; if past, KYC cannot be reused */
  @Column({ type: 'date', nullable: true, name: 'expiry_date' })
  expiry_date: Date | null;

  @Column({ type: 'boolean', default: false, name: 'selfie_verified' })
  selfie_verified: boolean;

  /** Whether this verification can be reused across services (policy + status) */
  @Column({ type: 'boolean', default: false, name: 'reusable_across_services' })
  reusable_across_services: boolean;

  /** If reuse is blocked: EXPIRED, REJECTED, INCOMPLETE, POLICY, etc. */
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'reuse_block_reason' })
  reuse_block_reason: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
