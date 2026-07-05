import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptMandatoryConsentsDto {
  @ApiProperty({ example: '2026-02' })
  @IsString()
  @MaxLength(40)
  termsVersion: string;

  @ApiProperty({ example: '2026-02' })
  @IsString()
  @MaxLength(40)
  privacyVersion: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @ApiPropertyOptional({ example: '2026-02' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  marketingVersion?: string;
}

export class UpdateMarketingConsentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  granted: boolean;

  @ApiProperty({ example: '2026-02' })
  @IsString()
  @MaxLength(40)
  version: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;
}
