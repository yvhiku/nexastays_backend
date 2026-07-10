import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ example: 'uuid-booking-id' })
  @IsUUID()
  bookingId: string;

  @ApiProperty({ example: 4.5, description: '0.5 increments from 0.5 to 5' })
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  assetIds?: string[];
}

/** Legacy body for POST /bookings/:id/review */
export class LegacyCreateReviewDto {
  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  assetIds?: string[];
}

export class AdminReviewStatusDto {
  @ApiProperty({ enum: ['PUBLISHED', 'HIDDEN', 'REMOVED'] })
  @IsIn(['PUBLISHED', 'HIDDEN', 'REMOVED'])
  status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
}
