import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('transaction_limits')
export class TransactionLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, name: 'kyc_level' })
  kyc_level: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    name: 'daily_limit',
  })
  daily_limit: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
    name: 'monthly_limit',
  })
  monthly_limit: number;
}
