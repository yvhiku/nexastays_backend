import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { IdentityPhoneNumber } from './identity-phone-number.entity';

/**
 * Unified Nexa Identity - ecosystem-level source of truth.
 * id is the permanent identity key. Phone numbers are verified login identifiers
 * stored in identity_phone_numbers; they are mutable and support multiple numbers.
 */
@Entity('unified_identities')
export class UnifiedIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * @deprecated TRANSITIONAL. Canonical source: identity_phone_numbers.
   * Use IdentityPhoneNumbersService.findIdentityByPhone for lookup.
   * Kept for migration/backward compat. See backend/docs/unified-account-retirement-roadmap.md.
   */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'phone_number' })
  phone_number: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'full_name' })
  full_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  date_of_birth: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'profile_photo_url' })
  profile_photo_url: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'preferred_language' })
  preferred_language: string | null;

  @Column({ type: 'boolean', default: false, name: 'identity_verified' })
  identity_verified: boolean;

  /**
   * Person-level identity verification status.
   * @see backend/docs/kyc-onboarding-status-domains.md
   */
  @Column({
    type: 'varchar',
    length: 30,
    default: 'NOT_STARTED',
    name: 'identity_verification_status',
  })
  identity_verification_status: string;

  /** @deprecated Use identity_verification_status. Kept for backward compat. */
  @Column({ type: 'varchar', length: 20, default: 'PENDING', name: 'kyc_status' })
  kyc_status: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'kyc_level' })
  kyc_level: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE', name: 'account_status' })
  account_status: string;

  /**
   * Derived, non-authoritative. Refreshed from attached User rows.
   * Do not treat as source of truth; query users by unified_identity_id for accounts.
   * See backend/docs/unified-account-retirement-roadmap.md.
   */
  @Column({ type: 'jsonb', default: [], name: 'linked_services' })
  linked_services: string[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => User, (user) => user.unified_identity)
  users: User[];

  @OneToMany(() => IdentityPhoneNumber, (ipn) => ipn.identity)
  phone_numbers: IdentityPhoneNumber[];
}
