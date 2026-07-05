import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFraudEventDto {
  @IsIn(['OPEN', 'REVIEWING', 'RESOLVED', 'FALSE_POSITIVE'])
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'FALSE_POSITIVE';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assigned_owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internal_note?: string;
}
