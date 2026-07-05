import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pin_attempts')
export class PinAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'user_id' })
  user_id: string;

  @Column({ type: 'int', name: 'failed_count', default: 0 })
  failed_count: number;

  @Column({ type: 'int', name: 'lockout_level', default: 0 })
  lockout_level: number;

  @Column({ type: 'timestamp', name: 'first_failed_at', nullable: true })
  first_failed_at: Date | null;

  @Column({ type: 'timestamp', name: 'lockout_until', nullable: true })
  lockout_until: Date | null;

  @Column({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
