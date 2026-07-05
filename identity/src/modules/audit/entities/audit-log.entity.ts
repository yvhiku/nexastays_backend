import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  user_id: string;

  @ManyToOne(() => User, (user) => user.audit_logs)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true, name: 'admin_user_id' })
  admin_user_id: string;

  @Column({ type: 'varchar', length: 150, nullable: true, name: 'admin_email' })
  admin_email: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'entity_type' })
  entity_type: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'entity_id' })
  entity_id: string;

  @Column({ type: 'varchar', length: 60, nullable: true, name: 'ip_address' })
  ip_address: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'device_id' })
  device_id: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;
}
