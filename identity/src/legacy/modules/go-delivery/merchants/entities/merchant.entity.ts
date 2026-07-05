import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { MerchantStatus } from '../../enums/merchant-status.enum';
import { Menu } from '../../menus/entities/menu.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('merchants', { schema: 'go_delivery' })
@Index(['user_id'])
@Index(['status'])
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: MerchantStatus,
    default: MerchantStatus.PENDING,
  })
  status: MerchantStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToMany(() => Menu, (menu) => menu.merchant)
  menus: Menu[];

  @OneToMany(() => Order, (order) => order.merchant)
  orders: Order[];
}
