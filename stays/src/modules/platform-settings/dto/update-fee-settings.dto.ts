import { IsNumber, Max, Min } from 'class-validator';

export class UpdateFeeSettingsDto {
  /** Decimal fraction, e.g. 0.05 for 5% */
  @IsNumber()
  @Min(0)
  @Max(0.5)
  guest_fee_pct: number;

  @IsNumber()
  @Min(0)
  @Max(0.5)
  host_fee_pct: number;
}
