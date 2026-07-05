import {
  IsOptional,
  IsString,
  IsEmail,
  IsIn,
  IsISO8601,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['MA', 'OTHER'])
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferred_language?: string;

  /** ISO 8601 date (e.g. YYYY-MM-DD) */
  @IsOptional()
  @IsISO8601({ strict: false })
  date_of_birth?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  profile_photo_url?: string;
}
