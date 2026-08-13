import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const SUPPORT_TICKET_CATEGORIES = [
  'BOOKING',
  'PAYMENT',
  'REFUND',
  'CANCELLATION',
  'HOST',
  'GUEST',
  'LISTING',
  'KYC',
  'TECHNICAL',
  'FRAUD',
  'OTHER',
] as const;

export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_HOST',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const;

export const SUPPORT_TICKET_PRIORITIES = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
] as const;

export class CreateSupportTicketDto {
  @IsString()
  @IsIn([...SUPPORT_TICKET_CATEGORIES])
  category!: (typeof SUPPORT_TICKET_CATEGORIES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUUID('4')
  bookingId?: string;

  @IsOptional()
  @IsUUID('4')
  listingId?: string;

  @IsOptional()
  @IsUUID('4')
  reportId?: string;

  @IsOptional()
  @IsUUID('4')
  safetyIssueId?: string;

  @IsOptional()
  @IsUUID('4')
  clientRequestId?: string;
}

export class PatchSupportTicketDto {
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_TICKET_STATUSES])
  status?: (typeof SUPPORT_TICKET_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_TICKET_PRIORITIES])
  priority?: (typeof SUPPORT_TICKET_PRIORITIES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(128)
  assigned_admin_id?: string | null;
}

export class SendSupportTicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
