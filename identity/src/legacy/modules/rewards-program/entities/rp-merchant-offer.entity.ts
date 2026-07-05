import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RpCategory } from './rp-category.entity';

@Entity('rp_merchant_offers')
export class RpMerchantOffer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  merchant_name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  merchant_logo: string | null;

  @Column({ type: 'int', nullable: true })
  category_id: number | null;

  @ManyToOne(() => RpCategory, (c) => c.offers, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: RpCategory | null;

  @Column({ type: 'varchar', length: 30 })
  offer_type: string;

  @Column({ type: 'varchar', length: 255 })
  offer_title: string;

  @Column({ type: 'text', nullable: true })
  offer_description: string | null;

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  boost_rate: string | null;

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  points_multiplier: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  voucher_value: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  min_spend: string | null;

  @Column({ type: 'varchar', length: 20, default: 'merchant' })
  funded_by: string;

  @Column({ type: 'timestamptz' })
  valid_from: Date;

  @Column({ type: 'timestamptz' })
  valid_until: Date;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
