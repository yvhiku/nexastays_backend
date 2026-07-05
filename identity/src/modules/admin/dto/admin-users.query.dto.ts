import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

const ACCOUNT_TYPES = [
  'CONSUMER',
  'DRIVER',
  'COURIER',
  'HOST',
  'MERCHANT',
  'ADMIN',
  'all',
] as const;

export class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  kyc?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_TYPES)
  account_type?: (typeof ACCOUNT_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
