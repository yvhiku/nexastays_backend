import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMerchantOfferDto {
  @IsString()
  @MaxLength(255)
  merchant_name: string;

  @IsOptional()
  @IsString()
  merchant_logo?: string | null;

  @IsOptional()
  @IsInt()
  category_id?: number | null;

  @IsString()
  offer_type: 'cashback_boost' | 'points_multiplier' | 'voucher' | 'loyalty_stamp';

  @IsString()
  @MaxLength(255)
  offer_title: string;

  @IsOptional()
  @IsString()
  offer_description?: string | null;

  @IsOptional()
  @IsNumber()
  boost_rate?: number | null;

  @IsOptional()
  @IsNumber()
  points_multiplier?: number | null;

  @IsOptional()
  @IsNumber()
  voucher_value?: number | null;

  @IsOptional()
  @IsNumber()
  min_spend?: number | null;

  @IsOptional()
  @IsString()
  funded_by?: 'merchant' | 'nexa' | 'co_funded';

  @IsDateString()
  valid_from: string;

  @IsDateString()
  valid_until: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;
}
