import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('stays_support_agent_performance_snapshots')
@Index('stays_support_agent_perf_snap_unique', ['agent_user_id', 'snapshot_date'], {
  unique: true,
})
export class StaysSupportAgentPerformanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128, name: 'agent_user_id' })
  agent_user_id: string;

  @Column({ type: 'date', name: 'snapshot_date' })
  snapshot_date: string;

  @Column({ type: 'int', name: 'tickets_closed', default: 0 })
  tickets_closed: number;

  @Column({ type: 'int', name: 'tickets_reopened', default: 0 })
  tickets_reopened: number;

  @Column({ type: 'int', name: 'review_count', default: 0 })
  review_count: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    name: 'average_agent_rating',
    nullable: true,
  })
  average_agent_rating: string | null;

  @Column({ type: 'int', name: 'problem_solved_count', default: 0 })
  problem_solved_count: number;

  @Column({ type: 'int', name: 'problem_not_solved_count', default: 0 })
  problem_not_solved_count: number;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'problem_solved_rate',
    nullable: true,
  })
  problem_solved_rate: string | null;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    name: 'overall_average_rating',
    nullable: true,
  })
  overall_average_rating: string | null;

  @Column({ type: 'int', name: 'first_response_count', default: 0 })
  first_response_count: number;

  @Column({ type: 'int', name: 'first_response_sla_met', default: 0 })
  first_response_sla_met: number;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'first_response_sla_rate',
    nullable: true,
  })
  first_response_sla_rate: string | null;

  @Column({ type: 'int', name: 'resolution_count', default: 0 })
  resolution_count: number;

  @Column({ type: 'int', name: 'resolution_sla_met', default: 0 })
  resolution_sla_met: number;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 4,
    name: 'resolution_sla_rate',
    nullable: true,
  })
  resolution_sla_rate: string | null;

  @Column({ type: 'int', name: 'average_first_response_seconds', nullable: true })
  average_first_response_seconds: number | null;

  @Column({ type: 'int', name: 'average_resolution_seconds', nullable: true })
  average_resolution_seconds: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at: Date;
}
