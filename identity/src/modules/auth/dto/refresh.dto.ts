import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;

  @IsOptional()
  @IsString()
  device_id?: string;
}

export class LogoutDto {
  /** If set, revoke only this device's refresh tokens; otherwise revoke all for the user. */
  @IsOptional()
  @IsString()
  device_id?: string;
}
