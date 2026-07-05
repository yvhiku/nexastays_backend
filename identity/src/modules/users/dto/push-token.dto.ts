import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web', 'unknown'])
  platform?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdatePushPreferenceDto {
  @IsBoolean()
  transaction_alerts_enabled: boolean;
}
