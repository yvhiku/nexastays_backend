import {
  IsArray,
  IsOptional,
  IsString,
  IsIn,
  IsNumber,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  Matches,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class MediaItemDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  asset_id: string;

  @IsIn(['PHOTO', 'WALKTHROUGH'])
  kind: 'PHOTO' | 'WALKTHROUGH';

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1000)
  sort_order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @Type(() => Boolean)
  is_cover?: boolean;
}

/** Replace all media rows on a DRAFT (or editable) listing. */
export class ReplaceListingMediaDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media: MediaItemDto[];
}
