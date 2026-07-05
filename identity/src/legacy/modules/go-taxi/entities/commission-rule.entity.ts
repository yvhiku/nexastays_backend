import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ServiceType } from './pricing-rule.entity';

export enum CommissionActor {
  DRIVER = 'DRIVER',
  MERCHANT = 'MERCHANT',
  COURIER = 'COURIER',
}

@Entity('commission_rules', { schema: 'go' })
@Index(['service_type', 'actor', 'active'])
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ServiceType,
    name: 'service_type',
  })
  service_type: ServiceType;

  @Column({
    type: 'enum',
    enum: CommissionActor,
  })
  actor: CommissionActor;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    comment: 'Commission percentage (e.g., 0.14 for 14%)',
  })
  percentage: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'flat_fee',
    nullable: true,
    default: 0,
    comment: 'Flat fee in addition to percentage (if any)',
  })
  flat_fee: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
