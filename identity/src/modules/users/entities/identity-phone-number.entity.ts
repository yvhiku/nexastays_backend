import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UnifiedIdentity } from './unified-identity.entity';

/**
 * Canonical source of verified login identifiers.
 * E.164 normalized. One phone → one identity (UNIQUE normalized_phone_number).
 * Use IdentityPhoneNumbersService.findIdentityByPhone for lookup.
 * Supports multiple numbers per identity and future phone changes.
 * See backend/docs/unified-account-system.md.
 */
@Entity('identity_phone_numbers')
@Index('idx_identity_phone_numbers_normalized', ['normalized_phone_number'], {
  unique: true,
})
export class IdentityPhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'identity_id', nullable: false })
  identity_id: string;

  @ManyToOne(() => UnifiedIdentity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'identity_id' })
  identity: UnifiedIdentity;

  @Column({ type: 'varchar', length: 20, name: 'phone_number', nullable: false })
  phone_number: string;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'normalized_phone_number',
    nullable: false,
  })
  normalized_phone_number: string;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  is_primary: boolean;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  is_verified: boolean;

  @Column({ type: 'timestamptz', name: 'verified_at', nullable: true })
  verified_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
