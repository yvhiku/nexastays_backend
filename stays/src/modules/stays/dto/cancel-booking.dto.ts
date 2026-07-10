import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @IsIn(['guest', 'host'])
  cancelled_by: 'guest' | 'host';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
