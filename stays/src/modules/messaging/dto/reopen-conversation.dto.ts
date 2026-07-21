import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  disableAutoArchive?: boolean;
}
