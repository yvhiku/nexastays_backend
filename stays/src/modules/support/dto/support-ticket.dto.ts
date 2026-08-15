import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

export class CreateSupportTicketNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class CreateSupportTicketCsatDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  agentRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateCannedReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;
}

export class PatchCannedReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  is_active?: boolean;
}

export class ListCannedRepliesQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;
}

export class ListSupportTicketNotesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export const TRUST_REPORT_KINDS = [
  'conversation_reported',
  'safety_issue',
] as const;

export const TRUST_REPORT_STATUSES = [
  'OPEN',
  'REVIEWED',
  'ESCALATED',
  'DISMISSED',
] as const;

export class InvestigationConversationQueryDto {
  @IsString()
  @IsIn([...TRUST_REPORT_KINDS])
  kind!: (typeof TRUST_REPORT_KINDS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  before_sequence?: number;
}

export class PatchTrustReportDto {
  @IsString()
  @IsIn([...TRUST_REPORT_KINDS])
  kind!: (typeof TRUST_REPORT_KINDS)[number];

  @IsString()
  @IsIn([...TRUST_REPORT_STATUSES])
  status!: (typeof TRUST_REPORT_STATUSES)[number];
}

export class AdminListTicketsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_TICKET_PRIORITIES])
  priority?: (typeof SUPPORT_TICKET_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORT_TICKET_CATEGORIES])
  category?: (typeof SUPPORT_TICKET_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  assignedAdminId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  unassigned?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requesterUserId?: string;

  @IsOptional()
  @IsUUID('4')
  bookingId?: string;

  @IsOptional()
  @IsUUID('4')
  listingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AT_RISK', 'BREACHED'])
  slaState?: 'AT_RISK' | 'BREACHED';
}

export class AdminListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @IsIn([...TRUST_REPORT_STATUSES])
  status?: (typeof TRUST_REPORT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...TRUST_REPORT_KINDS])
  kind?: (typeof TRUST_REPORT_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reporterUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reportedUserId?: string;

  /** Reporter or reported — conversation reports and safety issues stay separately filterable via kind. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @IsOptional()
  @IsUUID('4')
  bookingId?: string;

  @IsOptional()
  @IsUUID('4')
  listingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
