import { IsOptional, IsString } from 'class-validator';

export class AdminWalletsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
