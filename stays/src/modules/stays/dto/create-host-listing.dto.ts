import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  Matches,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class RulesDto {
  @IsOptional()
  @IsIn(['ALLOWED', 'DOGS_CATS', 'NO'])
  pets_policy?: 'ALLOWED' | 'DOGS_CATS' | 'NO';

  @IsOptional()
  @IsIn(['ALLOWED', 'NOT_ALLOWED'])
  smoking_policy?: 'ALLOWED' | 'NOT_ALLOWED';

  @IsOptional()
  @Type(() => Boolean)
  quiet_hours?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  couples_welcome?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  max_guests?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  amenities?: string[];

  @IsOptional()
  @IsIn(['FLEXIBLE', 'MODERATE', 'STRICT'])
  cancellation_policy?: 'FLEXIBLE' | 'MODERATE' | 'STRICT';
}

class RatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  base_price: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10_000_000)
  weekend_price?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(10_000_000)
  cleaning_fee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deposit_policy_text?: string;
}

class CheckInContactDto {
  @IsString()
  @MaxLength(100)
  full_name: string;

  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d\s\-()]+$/, { message: 'phone contains invalid characters' })
  phone: string;

  @IsIn(['OWNER', 'CO_HOST', 'AGENT'])
  role: 'OWNER' | 'CO_HOST' | 'AGENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  access_instructions?: string;
}

class MediaItemDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  asset_id: string;

  @IsIn(['PHOTO', 'WALKTHROUGH'])
  kind: 'PHOTO' | 'WALKTHROUGH';

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1000)
  sort_order?: number;
}

export class CreateHostListingDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA', 'HOSTEL'])
  listing_type: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';

  @IsString()
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-'.]+$/u)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  checkin_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  checkout_time?: string;

  @IsOptional()
  @Type(() => Boolean)
  instant_booking?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RulesDto)
  rules?: RulesDto;

  @ValidateNested()
  @Type(() => RatePlanDto)
  rate_plan: RatePlanDto;

  @ValidateNested()
  @Type(() => CheckInContactDto)
  check_in_contact: CheckInContactDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media: MediaItemDto[];
}
