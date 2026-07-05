import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';

@Entity('courier_availability')
export class CourierAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'courier_user_id', unique: true })
  courier_user_id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'courier_user_id' })
  courier_user: User;

  @Column({ type: 'boolean', name: 'is_online', default: false })
  is_online: boolean;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'lat',
    nullable: true,
  })
  lat: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    name: 'lng',
    nullable: true,
  })
  lng: number | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updated_at: Date;
}
