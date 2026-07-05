import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PeriodCategoryRateItemDto {
  @IsInt()
  categoryId: number;

  @IsNumber()
  @Min(2)
  @Max(5)
  cashbackRate: number;
}

export class SetCategoryRatesDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => PeriodCategoryRateItemDto)
  categories: PeriodCategoryRateItemDto[];
}
