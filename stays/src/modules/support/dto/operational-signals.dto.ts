import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  OPERATIONAL_SIGNAL_SEVERITIES,
  OPERATIONAL_SIGNAL_STATUSES,
  OPERATIONAL_SIGNAL_TYPES,
} from '../operational-signals.constants';

export class AdminListSignalsQueryDto {
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
  @IsIn([...OPERATIONAL_SIGNAL_STATUSES])
  status?: (typeof OPERATIONAL_SIGNAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...OPERATIONAL_SIGNAL_SEVERITIES])
  severity?: (typeof OPERATIONAL_SIGNAL_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...OPERATIONAL_SIGNAL_TYPES])
  type?: (typeof OPERATIONAL_SIGNAL_TYPES)[number];

  @IsOptional()
  @IsUUID('4')
  ticketId?: string;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeResolved?: boolean;
}

export class PatchOperationalSignalDto {
  @IsString()
  @IsIn(['ACKNOWLEDGED', 'RESOLVED'])
  status!: 'ACKNOWLEDGED' | 'RESOLVED';
}
