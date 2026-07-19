import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListingAvailabilityQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class HostAvailabilityBlockDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_blocked?: boolean;
}

export class CreatePaymentIntentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]*$/, {
    message: 'idempotency_key must be alphanumeric, underscore, or hyphen',
  })
  idempotency_key?: string;
}

export class MockPaymentWebhookDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'provider_intent_id contains invalid characters',
  })
  provider_intent_id: string;
}

export class RejectReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class HostApplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  host_type?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  identity_reused?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hosting_policies_accepted?: boolean;
}

export class BookingIdParamDto {
  @IsUUID()
  id: string;
}

export class ConnectExternalCalendarDto {
  @IsString()
  @Matches(/^(AIRBNB|BOOKING|VRBO|GOOGLE|APPLE|DIRECT|OTHER)$/)
  provider: 'AIRBNB' | 'BOOKING' | 'VRBO' | 'GOOGLE' | 'APPLE' | 'DIRECT' | 'OTHER';

  @IsString()
  @MaxLength(2000)
  ics_url: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider_listing_reference?: string;
}

export class UpdateExternalCalendarDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(ACTIVE|PAUSED)$/)
  status?: 'ACTIVE' | 'PAUSED';
}

