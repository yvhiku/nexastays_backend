import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { VehicleType } from '../../enums/vehicle-type.enum';
import { DriverStatus } from '../../enums/driver-status.enum';
import { DriverAvailability } from './driver-availability.entity';

@Entity('driver_profiles', { schema: 'go' })
@Index(['user_id'])
@Index(['status'])
export class DriverProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true, name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: VehicleType,
    name: 'vehicle_type',
  })
  vehicle_type: VehicleType;

  @Column({ type: 'varchar', length: 20, name: 'vehicle_plate' })
  vehicle_plate: string;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.PENDING,
  })
  status: DriverStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToOne(() => DriverAvailability, (availability) => availability.driver)
  availability: DriverAvailability;
}
