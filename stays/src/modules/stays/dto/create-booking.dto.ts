import {
  Allow,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  MaxLength,
  IsEmail,
  IsIn,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OccupantDto {
  @IsString()
  @MaxLength(100)
  full_name: string;

  @Allow()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9\-/\s]*$/, {
    message: 'id_number contains invalid characters',
  })
  id_number?: string;

  @Allow()
  @IsOptional()
  @Type(() => Boolean)
  is_primary?: boolean;

  @Allow()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d\s\-()]*$/, { message: 'phone contains invalid characters' })
  phone?: string;

  @Allow()
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @Allow()
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;

  @Allow()
  @IsOptional()
  @IsUUID()
  id_document_front_asset_id?: string;

  @Allow()
  @IsOptional()
  @IsUUID()
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
  @Max(50)
  guest_count: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]*$/, {
    message: 'idempotency_key must be alphanumeric, underscore, or hyphen',
  })
  idempotency_key?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OccupantDto)
  occupants?: OccupantDto[];
}
