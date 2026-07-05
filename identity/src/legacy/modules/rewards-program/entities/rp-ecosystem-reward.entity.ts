import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rp_ecosystem_rewards')
export class RpEcosystemReward {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  brand: 'nexa_stays' | 'nexa_go';

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url: string | null;

  @Column({ type: 'int' })
  points_cost: number;

  @Column({ type: 'varchar', length: 100 })
  discount_value: string;

  @Column({ type: 'varchar', length: 20, default: 'standard' })
  min_tier: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  valid_until: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
