import { IsArray, IsOptional, IsString, IsUUID, MaxLength, ArrayMaxSize } from 'class-validator';

export class ReportConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
