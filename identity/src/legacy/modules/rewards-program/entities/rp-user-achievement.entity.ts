import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RpAchievement } from './rp-achievement.entity';

@Entity('rp_user_achievements')
@Unique(['user_id', 'achievement_id'])
export class RpUserAchievement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int' })
  achievement_id: number;

  @ManyToOne(() => RpAchievement, (a) => a.user_rows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'achievement_id' })
  achievement: RpAchievement;

  @CreateDateColumn({ type: 'timestamptz' })
  unlocked_at: Date;

  @Column({ type: 'int' })
  points_awarded: number;
}
