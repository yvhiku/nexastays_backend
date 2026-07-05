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
import { Menu } from './menu.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';

@Entity('menu_items', { schema: 'go_delivery' })
@Index(['menu_id'])
@Index(['is_available'])
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'menu_id' })
  menu_id: string;

  @ManyToOne(() => Menu, (menu) => menu.items)
  @JoinColumn({ name: 'menu_id' })
  menu: Menu;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  price: number;

  @Column({ type: 'boolean', default: true, name: 'is_available' })
  is_available: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.menu_item)
  order_items: OrderItem[];
}
