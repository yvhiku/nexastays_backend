import { IsString } from 'class-validator';

export class ReverseTransactionDto {
  @IsString()
  reason: string;
}
