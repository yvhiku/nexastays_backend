import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { StaysListing } from './stays-listing.entity';

@Entity('stays_check_in_contacts')
export class StaysCheckInContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'listing_id' })
  listing_id: string;

  @OneToOne(() => StaysListing, (l) => l.check_in_contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: StaysListing;

  @Column({ type: 'varchar', length: 100, name: 'full_name' })
  full_name: string;

  @Column({ type: 'text', name: 'phone_encrypted' })
  phone_encrypted: string;

  @Column({ type: 'varchar', length: 20 })
  role: 'OWNER' | 'CO_HOST' | 'AGENT';

  @Column({ type: 'text', name: 'access_instructions', nullable: true })
  access_instructions: string | null;

  @Column({ type: 'varchar', length: 128, name: 'wifi_ssid', nullable: true })
  wifi_ssid: string | null;

  @Column({ type: 'varchar', length: 128, name: 'wifi_password', nullable: true })
  wifi_password: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
