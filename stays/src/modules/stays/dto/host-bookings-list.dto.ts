import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const HOST_BOOKING_FILTERS = [
  'all',
  'today',
  'checkin_today',
  'checkout_today',
  'upcoming',
  'current',
  'awaiting_payment',
  'completed',
  'cancelled',
] as const;

export type HostBookingFilterParam = (typeof HOST_BOOKING_FILTERS)[number];

export const HOST_BOOKING_SORTS = [
  'ops',
  'checkin',
  'checkout',
  'amount',
  'guest',
] as const;

export type HostBookingSortParam = (typeof HOST_BOOKING_SORTS)[number];

function emptyToUndef({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

export class HostBookingsListQueryDto {
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
  @IsIn([...HOST_BOOKING_FILTERS])
  filter?: HostBookingFilterParam;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsUUID()
  listing_id?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn([...HOST_BOOKING_SORTS])
  sort?: HostBookingSortParam;
}

export class HostBookingsCountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsUUID()
  listing_id?: string;
}
