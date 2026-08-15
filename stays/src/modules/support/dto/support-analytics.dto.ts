import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUPPORT_TICKET_CATEGORIES } from './support-ticket.dto';
import { SUPPORT_PERFORMANCE_RANGES } from '../support-quality.config';

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

export class AdminSupportPerformanceQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_PERFORMANCE_RANGES])
  range?: (typeof SUPPORT_PERFORMANCE_RANGES)[number];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_TICKET_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ar', 'fr', 'en'])
  language?: string;
}

export class CreateCoachingNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}

export class PatchCoachingNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'COMPLETED'])
  status?: 'OPEN' | 'COMPLETED';
}
