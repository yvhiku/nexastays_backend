import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('stays_support_ticket_ref_counters')
export class StaysSupportTicketRefCounter {
  @PrimaryColumn({ type: 'int' })
  year: number;

  @Column({ type: 'bigint', default: 0 })
  counter: string;
}
