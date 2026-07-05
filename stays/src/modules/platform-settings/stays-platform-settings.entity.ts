import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stays_platform_settings')
export class StaysPlatformSettings {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    name: 'guest_fee_pct',
    default: 0.05,
  })
  guest_fee_pct: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    name: 'host_fee_pct',
    default: 0.05,
  })
  host_fee_pct: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updated_by: string | null;
}
