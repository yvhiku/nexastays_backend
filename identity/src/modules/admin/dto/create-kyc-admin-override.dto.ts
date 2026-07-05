import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateKycAdminOverrideDto {
  @IsUUID()
  user_id: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsBoolean()
  bypass_kyc_status_gate?: boolean;

  @IsOptional()
  @IsBoolean()
  bypass_all_limits?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boost_daily_outflow_mad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boost_monthly_outflow_mad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boost_max_single_transfer_mad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boost_daily_withdrawal_mad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boost_monthly_withdrawal_mad?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extra_allowed_country_codes?: string[];
}
