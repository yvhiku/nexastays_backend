import {
  IsArray,
  IsOptional,
  IsString,
  IsIn,
  IsNumber,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

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
