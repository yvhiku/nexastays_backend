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
  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA', 'HOSTEL'])
  listing_type?: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9_]+$/)
  amenity?: string;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  pets_allowed?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  luxury_only?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  family_friendly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}\s\-'.]*$/u)
  neighborhood?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  near_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  near_lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  near_radius_km?: number;

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
  @IsIn(['newest', 'rating', 'price_asc', 'price_desc'])
  sort?: 'newest' | 'rating' | 'price_asc' | 'price_desc';

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
