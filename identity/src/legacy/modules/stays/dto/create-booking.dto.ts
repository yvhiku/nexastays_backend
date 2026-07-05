import {
  Allow,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OccupantDto {
  @IsString()
  full_name: string;

  @Allow()
  @IsOptional()
  @IsString()
  id_number?: string;

  @Allow()
  @IsOptional()
  @Type(() => Boolean)
  is_primary?: boolean;

  @Allow()
  @IsOptional()
  @IsString()
  phone?: string;

  @Allow()
  @IsOptional()
  @IsString()
  email?: string;

  @Allow()
  @IsOptional()
  @IsString()
  gender?: string;

  @Allow()
  @IsOptional()
  @IsString()
  id_document_front_asset_id?: string;

  @Allow()
  @IsOptional()
  @IsString()
  id_document_back_asset_id?: string;
}

export class CreateBookingDto {
  @IsUUID()
  listing_id: string;

  @IsDateString()
  checkin_date: string;

  @IsDateString()
  checkout_date: string;

  @IsInt()
  @Min(1)
  guest_count: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotency_key?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OccupantDto)
  occupants?: OccupantDto[];
}
