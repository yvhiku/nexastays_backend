import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('kyc_profiles')
export class KycProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'user_id' })
  user_id: string;

  @OneToOne(() => User, (user) => user.kyc_profile)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'NONE' })
  level: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  provider: string;

  /** App/product that submitted this KYC: PAY | GO | STAYS. Null = legacy (treated as PAY). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'last_webhook_event_type',
    nullable: true,
  })
  last_webhook_event_type: string | null;

  @Column({
    type: 'timestamp',
    name: 'last_webhook_received_at',
    nullable: true,
  })
  last_webhook_received_at: Date | null;

  @Column({ type: 'timestamp', name: 'reviewed_at', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'varchar', length: 100, name: 'reviewed_by', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  documents: {
    id_document?: boolean;
    selfie?: boolean;
    liveness?: boolean;
  };

  @Column({ type: 'text', name: 'id_document_url', nullable: true })
  id_document_url: string | null;

  @Column({ type: 'text', name: 'selfie_url', nullable: true })
  selfie_url: string | null;

  @Column({
    type: 'varchar',
    length: 2048,
    name: 'document_front_url',
    nullable: true,
  })
  document_front_url: string | null;

  @Column({
    type: 'varchar',
    length: 2048,
    name: 'document_back_url',
    nullable: true,
  })
  document_back_url: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'document_type',
    nullable: true,
  })
  document_type: string | null;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'document_country',
    nullable: true,
  })
  document_country: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    name: 'national_id_number_hash',
    nullable: true,
  })
  national_id_number_hash: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'national_id_number',
    nullable: true,
  })
  national_id_number: string | null;

  /** ID number extracted from document via OCR (to compare with manual form entry) */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'national_id_number_extracted',
    nullable: true,
  })
  national_id_number_extracted: string | null;

  @Column({ type: 'varchar', length: 200, name: 'full_name', nullable: true })
  full_name: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    name: 'date_of_birth',
    nullable: true,
  })
  date_of_birth: string | null;

  @Column({ type: 'varchar', length: 10, name: 'nationality', nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 150, name: 'email', nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'aml_screening' })
  aml_screening: {
    status?: string;
    score?: number;
  };

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
