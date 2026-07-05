import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class AdminMonitoringQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsDateString()
  from_date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'all'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'all';

  @IsOptional()
  @IsIn([
    'OPEN',
    'REVIEWING',
    'RESOLVED',
    'FALSE_POSITIVE',
    'ACKNOWLEDGED',
    'UNDER_REVIEW',
    'REPORTED',
    'DISMISSED',
    'all',
  ])
  status?:
    | 'OPEN'
    | 'REVIEWING'
    | 'RESOLVED'
    | 'FALSE_POSITIVE'
    | 'ACKNOWLEDGED'
    | 'UNDER_REVIEW'
    | 'REPORTED'
    | 'DISMISSED'
    | 'all';

  @IsOptional()
  user_id?: string;

  @IsOptional()
  transaction_id?: string;

  @IsOptional()
  search?: string;
}
