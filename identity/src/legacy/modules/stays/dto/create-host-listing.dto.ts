import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
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
  max_guests?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsIn(['FLEXIBLE', 'MODERATE', 'STRICT'])
  cancellation_policy?: 'FLEXIBLE' | 'MODERATE' | 'STRICT';
}

class RatePlanDto {
  @IsOptional()
  @IsString()
  currency?: string;

  @IsNumber()
  @Min(0)
  base_price: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  weekend_price?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  cleaning_fee?: number;

  @IsOptional()
  @IsString()
  deposit_policy_text?: string;
}

class CheckInContactDto {
  @IsString()
  full_name: string;

  @IsString()
  phone: string;

  @IsIn(['OWNER', 'CO_HOST', 'AGENT'])
  role: 'OWNER' | 'CO_HOST' | 'AGENT';
}

class MediaItemDto {
  @IsString()
  asset_id: string;

  @IsIn(['PHOTO', 'WALKTHROUGH'])
  kind: 'PHOTO' | 'WALKTHROUGH';

  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class CreateHostListingDto {
  @IsString()
  title: string;

  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA'])
  listing_type: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA';

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  checkin_time?: string;

  @IsOptional()
  @IsString()
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
