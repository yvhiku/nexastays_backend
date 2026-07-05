import { IsOptional, IsString, IsInt, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchListingsDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  checkin_date?: string;

  @IsOptional()
  @IsString()
  checkout_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verified_walkthrough_only?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  instant_booking_only?: boolean;
}
