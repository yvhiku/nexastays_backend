import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DataExportDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pin: string;

  @ApiProperty({ enum: ['csv', 'pdf'], example: 'csv' })
  @IsString()
  @IsIn(['csv', 'pdf'])
  format: 'csv' | 'pdf';
}

export class DeletionRequestDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pin: string;

  @ApiPropertyOptional({ example: 'No longer using this account' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
