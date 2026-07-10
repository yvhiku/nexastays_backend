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
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchListingsDto {
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
  @Type(() => Boolean)
  @IsBoolean()
  verified_walkthrough_only?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  instant_booking_only?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA', 'HOSTEL'])
  listing_type?: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';
}
