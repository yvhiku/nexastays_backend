import { IsIn, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/** Minimal create: property type (intent) → server DRAFT. */
export class CreateDraftListingDto {
  @IsIn(['APARTMENT', 'HOTEL', 'RIAD', 'VILLA', 'HOSTEL'])
  listing_type: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';

  /** UI "Guest House" maps to APARTMENT + this flag in property_details. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  guest_house?: boolean;

  @IsOptional()
  @IsObject()
  property_details?: Record<string, unknown>;
}
