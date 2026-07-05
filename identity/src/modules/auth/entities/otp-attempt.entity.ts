import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('otp_attempts')
export class OtpAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20, name: 'phone_number' })
  phone_number: string;

  @Index()
  @Column({ type: 'varchar', length: 45 })
  ip: string;

  @Column({ type: 'int', name: 'failed_count', default: 0 })
  failed_count: number;

  @Column({ type: 'timestamp', name: 'locked_until', nullable: true })
  locked_until: Date | null;

  @Column({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
