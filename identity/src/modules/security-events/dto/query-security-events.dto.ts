import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  SECURITY_EVENT_TYPES,
  type SecurityEventType,
} from '../entities/security-event.entity';

export class QuerySecurityEventsDto {
  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsIn(SECURITY_EVENT_TYPES as unknown as string[])
  event_type?: SecurityEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
