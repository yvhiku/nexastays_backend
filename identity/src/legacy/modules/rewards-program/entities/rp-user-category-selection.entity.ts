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
import { RpBillingPeriod } from './rp-billing-period.entity';
import { RpCategory } from './rp-category.entity';

@Entity('rp_user_category_selections')
@Unique(['user_id', 'billing_period_id', 'category_id'])
export class RpUserCategorySelection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int' })
  billing_period_id: number;

  @ManyToOne(() => RpBillingPeriod, (p) => p.user_selections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'billing_period_id' })
  billing_period: RpBillingPeriod;

  @Column({ type: 'int' })
  category_id: number;

  @ManyToOne(() => RpCategory, (c) => c.selections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: RpCategory;

  @CreateDateColumn({ type: 'timestamptz' })
  selected_at: Date;
}
