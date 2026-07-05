import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminKycQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  /** Filter by source: PAY | GO | STAYS. PAY includes legacy (null). */
  @IsOptional()
  @IsString()
  source?: string;

  /** Page (1-based). Default 1. */
  @IsOptional()
  @Type(() => Number)
  page?: number;

  /** Limit per page. Default 50, max 100. */
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  /** Search by phone (partial) or user_id (exact UUID). */
  @IsOptional()
  @IsString()
  search?: string;

  /** For source=GO: filter by account_type (CONSUMER, DRIVER, COURIER, MERCHANT). For source=PAY: CONSUMER, MERCHANT. */
  @IsOptional()
  @IsString()
  account_type?: string;

  /** For source=STAYS: filter by stays_role (USER=guest, HOST=has host profile). */
  @IsOptional()
  @IsString()
  stays_role?: string;

  /**
   * Filter by identity document kind (matches mobile app labels, case-insensitive).
   * national_id = Moroccan CIN / National Identity Card; passport; driver_license.
   */
  @IsOptional()
  @IsString()
  document_category?: string;

  /** Ignored; used by frontend to bust cache. */
  @IsOptional()
  @IsString()
  _t?: string;
}
