import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const HOST_LISTING_STATUS_FILTERS = [
  'all',
  'active',
  'pending',
  'paused',
  'draft',
  'needs_changes',
] as const;

export type HostListingStatusFilterParam =
  (typeof HOST_LISTING_STATUS_FILTERS)[number];

export const HOST_LISTING_SORTS = [
  'default',
  'title',
  'city',
  'status',
  'updated',
  'price',
] as const;

export type HostListingSortParam = (typeof HOST_LISTING_SORTS)[number];

function emptyToUndef({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

export class HostListingsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  cursor?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn([...HOST_LISTING_STATUS_FILTERS])
  status?: HostListingStatusFilterParam;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn([...HOST_LISTING_SORTS])
  sort?: HostListingSortParam;
}

export class HostListingsCountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
