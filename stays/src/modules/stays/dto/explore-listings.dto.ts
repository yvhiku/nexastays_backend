import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsIn,
  IsDateString,
  MaxLength,
  Matches,
  IsNumber,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

function toQueryBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

/** Shared Explore / map search filters + pagination. */
export class ExploreListingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-'.]*$/u, {
    message: 'city contains invalid characters',
  })
  city?: string;

  @IsOptional()
  @IsDateString()
  checkin_date?: string;

  @IsOptional()
  @IsDateString()
  checkout_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guests?: number;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  verified_walkthrough_only?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  instant_booking_only?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA', 'HOSTEL'])
  listing_type?: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsIn(['newest', 'rating'])
  sort?: 'newest' | 'rating';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  north?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  south?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  east?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  west?: number;
}

/**
 * Map pins require bounds. Same filters as ExploreListingsDto;
 * required north/south/east/west are enforced in ExploreService.validateBounds.
 */
export class ExploreMapDto extends ExploreListingsDto {}
