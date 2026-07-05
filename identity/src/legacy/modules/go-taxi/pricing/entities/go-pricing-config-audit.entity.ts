import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'go_pricing_config_audit', schema: 'go' })
@Index(['vehicle_type'])
@Index(['changed_at'])
export class GoPricingConfigAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'config_id' })
  config_id: string;

  @Column({ type: 'varchar', length: 20, name: 'vehicle_type' })
  vehicle_type: string;

  @Column({ type: 'varchar', length: 255, name: 'changed_by' })
  changed_by: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changed_at: Date;

  @Column({ type: 'varchar', length: 100, name: 'field_name' })
  field_name: string;

  @Column({ type: 'text', name: 'old_value', nullable: true })
  old_value: string | null;

  @Column({ type: 'text', name: 'new_value', nullable: true })
  new_value: string | null;
}
