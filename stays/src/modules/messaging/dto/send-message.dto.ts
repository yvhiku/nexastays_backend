import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'FILE'])
  type?: 'TEXT' | 'IMAGE' | 'FILE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @IsUUID()
  client_message_id?: string;
}
