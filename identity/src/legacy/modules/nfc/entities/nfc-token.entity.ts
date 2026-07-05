import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('nfc_tokens')
export class NfcToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  merchant_phone_number: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'varchar', length: 128 })
  signature: string;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expires_at: Date;

  @Column({ type: 'timestamp', name: 'consumed_at', nullable: true })
  consumed_at: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
