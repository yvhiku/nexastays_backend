import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RpUserAchievement } from './rp-user-achievement.entity';

@Entity('rp_achievements')
export class RpAchievement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100 })
  icon: string;

  @Column({ type: 'int', default: 0 })
  points_reward: number;

  @Column({ type: 'varchar', length: 20, default: '#F59E0B' })
  badge_color: string;

  @Column({ type: 'varchar', length: 20, default: 'standard' })
  min_tier: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => RpUserAchievement, (u) => u.achievement)
  user_rows: RpUserAchievement[];
}
