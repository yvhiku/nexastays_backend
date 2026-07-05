import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;

  /** Driver app: driver | courier. When set, response includes kyc_reuse for registration flow. */
  @IsOptional()
  @IsString()
  @Matches(/^(driver|courier)$/, { message: 'registration_role must be driver or courier' })
  registration_role?: string;

  /** If provided and valid, immediately issue access_token for this account (skips account/select). */
  @IsOptional()
  @IsString()
  account_id?: string;
}

export class SelectAccountDto {
  @IsString()
  @IsNotEmpty()
  identity_session_token: string;

  @IsString()
  @IsNotEmpty()
  account_id: string;
}

export class CompleteRegistrationDto {
  @IsString()
  @IsNotEmpty()
  otp_session_token: string;
}

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  otp_session_token: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits' })
  pin: string;
}

export class VerifyPinDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'PIN must be 4-6 digits' })
  pin: string;

  /** App-scoped account selection. Default CONSUMER (Nexa Pay). */
  @IsOptional()
  @IsString()
  @Matches(/^(CONSUMER|DRIVER|COURIER|HOST|MERCHANT)$/, {
    message: 'account_type must be CONSUMER, DRIVER, COURIER, HOST, or MERCHANT',
  })
  account_type?: string;
}
