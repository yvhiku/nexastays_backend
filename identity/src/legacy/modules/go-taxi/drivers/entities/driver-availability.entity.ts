import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DriverProfile } from './driver-profile.entity';

@Entity('driver_availability', { schema: 'go' })
@Index(['is_online'], { where: '"is_online" = true' })
@Index(['latitude', 'longitude'], { where: '"is_online" = true' })
export class DriverAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'driver_id' })
  driver_id: string;

  @OneToOne(() => DriverProfile, (driver) => driver.availability)
  @JoinColumn({ name: 'driver_id' })
  driver: DriverProfile;

  @Column({ type: 'boolean', default: false, name: 'is_online' })
  is_online: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'updated_at',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
