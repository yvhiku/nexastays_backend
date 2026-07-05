import { IsString, Matches, MaxLength } from 'class-validator';

export class ChangePhoneDto {
  /** OTP sent to current phone */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  current_otp: string;

  /** New phone number (E.164) */
  @IsString()
  @MaxLength(20)
  new_phone_number: string;

  /** OTP sent to new phone */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  new_otp: string;
}
