import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
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
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  host_type?: string;

  @IsOptional()
  @IsIn(HOST_ONBOARDING_SOURCES)
  source?: HostOnboardingSource;

  @IsOptional()
  @IsString()
  submitted_from?: string;

  @IsOptional()
  @IsBoolean()
  use_existing_kyc?: boolean;

  @IsOptional()
  @IsBoolean()
  hosting_policies_accepted?: boolean;

  @IsOptional()
  @IsBoolean()
  identity_reused?: boolean;

  @IsOptional()
  @IsString()
  sumsub_applicant_id?: string;

  @IsOptional()
  @IsIn(IDENTITY_STATUSES)
  identity_status?: HostIdentityStatus;

  @IsOptional()
  @IsString()
  document_type?: string;

  @IsOptional()
  @IsString()
  document_number_hash?: string;

  @IsOptional()
  @IsString()
  document_front_asset_id?: string;

  @IsOptional()
  @IsString()
  document_back_asset_id?: string;

  @IsOptional()
  @IsString()
  selfie_asset_id?: string;
}
