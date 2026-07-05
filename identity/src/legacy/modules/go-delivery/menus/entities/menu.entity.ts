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
import { Merchant } from '../../merchants/entities/merchant.entity';
import { MenuItem } from './menu-item.entity';

@Entity('menus', { schema: 'go_delivery' })
@Index(['merchant_id'])
@Index(['is_active'])
export class Menu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'merchant_id' })
  merchant_id: string;

  @ManyToOne(() => Merchant, (merchant) => merchant.menus)
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToMany(() => MenuItem, (item) => item.menu)
  items: MenuItem[];
}
