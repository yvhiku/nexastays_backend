import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('waitlist_entries')
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  full_name: string;

  @Column({ type: 'varchar', length: 50, name: 'phone_number' })
  phone_number: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'text', name: 'how_will_use_nexa', nullable: true })
  how_will_use_nexa: string | null;

  @Column({ type: 'varchar', length: 100, default: 'unknown' })
  source: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  user_type: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
