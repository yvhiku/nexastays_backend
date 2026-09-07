import {
  IsArray,
  IsOptional,
  IsString,
  IsIn,
  IsNumber,
  IsObject,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class BedConfigItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;
}

class UnitTypeItemDto {
  @IsIn([
    'APARTMENT_UNIT',
    'HOTEL_ROOM',
    'RIAD_ROOM',
    'HOSTEL_DORM',
    'HOSTEL_PRIVATE',
    'VILLA_UNIT',
  ])
  kind:
    | 'APARTMENT_UNIT'
    | 'HOTEL_ROOM'
    | 'RIAD_ROOM'
    | 'HOSTEL_DORM'
    | 'HOSTEL_PRIVATE'
    | 'VILLA_UNIT';

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  max_guests?: number;

  @IsNumber()
  @Min(1)
  @Max(10_000_000)
  base_price: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsIn(['NIGHT', 'BED_NIGHT', 'ROOM_NIGHT'])
  pricing_unit?: 'NIGHT' | 'BED_NIGHT' | 'ROOM_NIGHT';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(64)
  amenities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => BedConfigItemDto)
  bed_config?: BedConfigItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  size_sqm?: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @Type(() => Boolean)
  is_active?: boolean;
}

export class ReplaceListingUnitTypesDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => UnitTypeItemDto)
  unit_types: UnitTypeItemDto[];
}
