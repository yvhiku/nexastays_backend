import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('registration_applications', { schema: 'go' })
export class RegistrationApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewed_at: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  reviewed_by: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'full_name' })
  full_name: string | null;

  @Column({ type: 'varchar', length: 50, name: 'phone_number' })
  phone_number: string;

  @Column({ type: 'varchar', length: 10, default: '+212', name: 'country_code' })
  country_code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'date', nullable: true, name: 'date_of_birth' })
  date_of_birth: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'emergency_contact' })
  emergency_contact: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'identity_document_type' })
  identity_document_type: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'identity_front_path' })
  identity_front_path: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'identity_back_path' })
  identity_back_path: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'selfie_path' })
  selfie_path: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'vehicle_make' })
  vehicle_make: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'vehicle_model' })
  vehicle_model: string | null;

  @Column({ type: 'int', nullable: true, name: 'vehicle_year' })
  vehicle_year: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'vehicle_color' })
  vehicle_color: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'license_plate' })
  license_plate: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'vehicle_category' })
  vehicle_category: string | null;

  @Column({ type: 'jsonb', default: {} })
  vehicle_photos: Record<string, string>;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'drivers_license_path' })
  drivers_license_path: string | null;

  @Column({ type: 'date', nullable: true, name: 'drivers_license_expiry' })
  drivers_license_expiry: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'vehicle_registration_path' })
  vehicle_registration_path: string | null;

  @Column({ type: 'date', nullable: true, name: 'vehicle_registration_expiry' })
  vehicle_registration_expiry: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'insurance_path' })
  insurance_path: string | null;

  @Column({ type: 'date', nullable: true, name: 'insurance_expiry' })
  insurance_expiry: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'background_check_path' })
  background_check_path: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
