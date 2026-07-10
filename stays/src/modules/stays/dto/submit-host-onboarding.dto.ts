import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  HOST_ONBOARDING_SOURCES,
  type HostIdentityStatus,
  type HostOnboardingSource,
} from '../hosts/host-onboarding.types';

const IDENTITY_STATUSES: HostIdentityStatus[] = [
  'NOT_STARTED',
  'PENDING',
  'VERIFIED',
  'FAILED',
  'NOT_REQUIRED',
];

export class SubmitHostOnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[\p{L}\p{N}\s\-'.]*$/u, {
    message: 'full_name contains invalid characters',
  })
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+\d\s\-()]*$/, { message: 'phone contains invalid characters' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}\s\-'.]*$/u, {
    message: 'city contains invalid characters',
  })
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_\-]*$/, {
    message: 'host_type contains invalid characters',
  })
  host_type?: string;

  @IsOptional()
  @IsIn(HOST_ONBOARDING_SOURCES)
  source?: HostOnboardingSource;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_\-]*$/, {
    message: 'submitted_from contains invalid characters',
  })
  submitted_from?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  use_existing_kyc?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hosting_policies_accepted?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  identity_reused?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_\-]*$/, {
    message: 'sumsub_applicant_id contains invalid characters',
  })
  sumsub_applicant_id?: string;

  @IsOptional()
  @IsIn(IDENTITY_STATUSES)
  identity_status?: HostIdentityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_\-]*$/, {
    message: 'document_type contains invalid characters',
  })
  document_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9+/=_-]*$/, {
    message: 'document_number_hash contains invalid characters',
  })
  document_number_hash?: string;

  @IsOptional()
  @IsUUID()
  document_front_asset_id?: string;

  @IsOptional()
  @IsUUID()
  document_back_asset_id?: string;

  @IsOptional()
  @IsUUID()
  selfie_asset_id?: string;
}
