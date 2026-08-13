import { Type } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

export class AdminSupportAnalyticsQueryDto {
  /** Inclusive lower bound on ticket.created_at (ISO date or datetime). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Exclusive upper bound on ticket.created_at (ISO date or datetime). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
