import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UnifiedIdentity } from './unified-identity.entity';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { IdempotencyKey } from '../entities/idempotency-key.entity';

export const ACCOUNT_TYPES = [
  'CONSUMER',
  'DRIVER',
  'COURIER',
  'HOST',
  'MERCHANT',
  'ADMIN',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const STAFF_ROLES = ['ADMIN', 'SUPPORT_AGENT'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function staffJwtClaims(
  staffRole: string | null | undefined,
): { role: StaffRole; roles: [StaffRole] } {
  const role: StaffRole =
    staffRole === 'SUPPORT_AGENT' ? 'SUPPORT_AGENT' : 'ADMIN';
  return { role, roles: [role] };
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Display/consistency. Canonical login identifiers in identity_phone_numbers.
   * Must match identity. Transitional; auth may resolve via identity first.
   * See backend/docs/unified-account-retirement-roadmap.md.
   */
  /** Nullable for ADMIN (email/password login); CONSUMER/DRIVER/etc. normally set. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone_number: string | null;

  /** FK to unified_identities – canonical root for human identity. All service accounts attach here. */
  @Column({ type: 'uuid', name: 'unified_identity_id', nullable: true })
  unified_identity_id: string | null;

  @ManyToOne(() => UnifiedIdentity, (ui) => ui.users, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'unified_identity_id' })
  unified_identity: UnifiedIdentity | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  full_name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  nationality: string;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'date', name: 'date_of_birth', nullable: true })
  date_of_birth: Date | null;

  @Column({ type: 'text', name: 'profile_photo_url', nullable: true })
  profile_photo_url: string | null;

  @Column({ type: 'timestamptz', name: 'profile_locked_at', nullable: true })
  profile_locked_at: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  /** CONSUMER | DRIVER | COURIER | HOST | MERCHANT | ADMIN */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'account_type',
    default: 'CONSUMER',
  })
  account_type: AccountType;

  /**
   * Dashboard staff authorization. Only meaningful when account_type = ADMIN.
   * ADMIN = Super Admin. SUPPORT_AGENT never appears together with ADMIN in JWT roles[].
   */
  @Column({
    type: 'varchar',
    length: 32,
    name: 'staff_role',
    default: 'ADMIN',
  })
  staff_role: StaffRole;

  /**
   * @deprecated Use getConsumerForIdentity(unified_identity_id) for payout resolution.
   * New role accounts leave null. Removal path: backend/docs/unified-account-retirement-roadmap.md.
   */
  @Column({ type: 'uuid', name: 'linked_user_id', nullable: true })
  linked_user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_user_id' })
  linked_user: User | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  kyc_status: string;

  @Column({ type: 'text' })
  pin_hash: string;

  /**
   * Argon2id hash for provisioned dashboard staff. Super Admin bootstrap
   * still uses ADMIN_EMAILS + env password. Never select in list APIs.
   */
  @Column({ type: 'text', name: 'staff_password_hash', nullable: true })
  staff_password_hash: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  /**
   * SEC-003: bumped on admin privilege revocation, freeze, or force-logout.
   * Access JWTs for ADMIN include claim `av` matching this value.
   */
  @Column({ type: 'int', name: 'authz_version', default: 1 })
  authz_version: number;

  @Column({ type: 'int', default: 0 })
  risk_score: number;

  @Column({ type: 'timestamp', name: 'last_login_at', nullable: true })
  last_login_at: Date;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'deletion_status',
    default: 'NONE',
  })
  deletion_status: 'NONE' | 'PENDING' | 'ANONYMIZED';

  @Column({
    type: 'timestamptz',
    name: 'deletion_requested_at',
    nullable: true,
  })
  deletion_requested_at: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'deletion_scheduled_for',
    nullable: true,
  })
  deletion_scheduled_for: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'pii_anonymized_at',
    nullable: true,
  })
  pii_anonymized_at: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToOne(() => KycProfile, (kyc) => kyc.user)
  kyc_profile: KycProfile;

  @OneToMany(() => AuditLog, (log) => log.user)
  audit_logs: AuditLog[];

  @OneToMany(() => IdempotencyKey, (key) => key.user)
  idempotency_keys: IdempotencyKey[];

  /** Nexa rewards program tier: standard | pro | premium */
  @Column({ type: 'varchar', length: 20, name: 'rewards_tier', default: 'standard' })
  rewards_tier: string;

  /** Cached Nexa Points balance; ledger is source of truth for history */
  @Column({ type: 'int', name: 'nexa_points', default: 0 })
  nexa_points: number;

  @Column({
    type: 'varchar',
    length: 32,
    name: 'rewards_referral_code',
    nullable: true,
    unique: true,
  })
  rewards_referral_code: string | null;

  @Column({
    type: 'boolean',
    name: 'rewards_kyc_completed',
    default: false,
  })
  rewards_kyc_completed: boolean;
}
