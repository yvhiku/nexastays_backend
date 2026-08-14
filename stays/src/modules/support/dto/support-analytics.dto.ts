import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

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

export class AdminSupportAttentionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
