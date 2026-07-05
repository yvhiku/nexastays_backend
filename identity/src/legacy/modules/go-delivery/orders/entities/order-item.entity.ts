import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { MenuItem } from '../../menus/entities/menu-item.entity';

@Entity('order_items', { schema: 'go_delivery' })
@Index(['order_id'])
@Index(['menu_item_id'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'order_id' })
  order_id: string;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid', name: 'menu_item_id' })
  menu_item_id: string;

  @ManyToOne(() => MenuItem, (menuItem) => menuItem.order_items)
  @JoinColumn({ name: 'menu_item_id' })
  menu_item: MenuItem;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'unit_price' })
  unit_price: number;
}
