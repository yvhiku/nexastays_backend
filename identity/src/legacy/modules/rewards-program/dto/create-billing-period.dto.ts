import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class CreateBillingPeriodDto {
  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
