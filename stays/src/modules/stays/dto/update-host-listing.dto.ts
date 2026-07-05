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

class UpdateRulesDto {
  @IsOptional()
  @IsIn(['ALLOWED', 'DOGS_CATS', 'NO'])
  pets_policy?: 'ALLOWED' | 'DOGS_CATS' | 'NO';

  @IsOptional()
  @IsIn(['ALLOWED', 'NOT_ALLOWED'])
  smoking_policy?: 'ALLOWED' | 'NOT_ALLOWED';

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

class UpdateRatePlanDto {
  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  base_price?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  weekend_price?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  cleaning_fee?: number;
}

class UpdateCheckInContactDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['OWNER', 'CO_HOST', 'AGENT'])
  role?: 'OWNER' | 'CO_HOST' | 'AGENT';

  @IsOptional()
  @IsString()
  access_instructions?: string;
}

export class UpdateHostListingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA'])
  listing_type?: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA';

  @IsOptional()
  @IsString()
  city?: string;

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
  @Type(() => UpdateRulesDto)
  rules?: UpdateRulesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRatePlanDto)
  rate_plan?: UpdateRatePlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCheckInContactDto)
  check_in_contact?: UpdateCheckInContactDto;
}
