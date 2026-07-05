import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ServiceType {
  RIDE = 'RIDE',
  DELIVERY = 'DELIVERY',
}

@Entity('pricing_rules', { schema: 'go' })
@Index(['service_type', 'active'])
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ServiceType,
    name: 'service_type',
  })
  service_type: ServiceType;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'base_fare',
    default: 10.0,
  })
  base_fare: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'per_km',
    default: 2.0,
  })
  per_km: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'per_min',
    default: 0.5,
  })
  per_min: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'wait_rate',
    nullable: true,
    default: 0.3,
  })
  wait_rate: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'surge_multiplier',
    default: 1.0,
  })
  surge_multiplier: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
