import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refresh_token?: string;

  @IsOptional()
  @IsString()
  device_id?: string;
}

export class LogoutDto {
  /**
   * Optional plaintext refresh token. When present (or supplied via HttpOnly cookie),
   * only that refresh session is revoked (current device/session).
   */
  @IsOptional()
  @IsString()
  refresh_token?: string;

  /**
   * If set (and no refresh_token), revoke only this device's refresh tokens
   * for the authenticated JWT principal. Never used to revoke another user.
   */
  @IsOptional()
  @IsString()
  device_id?: string;
}
