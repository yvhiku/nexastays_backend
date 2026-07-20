import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsUUID()
  client_message_id?: string;
}
