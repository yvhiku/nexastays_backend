import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('risk_alerts')
export class RiskAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 10 })
  severity: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'transaction_id', nullable: true })
  transaction_id: string | null;

  /** MAD amount for transfer-related alerts (set at creation when tx row may not exist yet). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  amount: number | null;

  /** e.g. TXN-… reference from the attempted transfer. */
  @Column({ type: 'varchar', length: 100, name: 'transaction_reference', nullable: true })
  transaction_reference: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int', default: 0, name: 'risk_score' })
  risk_score: number;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
