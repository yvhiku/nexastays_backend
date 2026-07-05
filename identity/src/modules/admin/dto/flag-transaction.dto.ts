import { IsString } from 'class-validator';

export class FlagTransactionDto {
  @IsString()
  reason: string;
}
