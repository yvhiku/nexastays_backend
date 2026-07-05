import { IsIn, IsOptional, IsString } from 'class-validator';

export class CancelBookingDto {
  @IsIn(['guest', 'host'])
  cancelled_by: 'guest' | 'host';

  @IsOptional()
  @IsString()
  reason?: string;
}
