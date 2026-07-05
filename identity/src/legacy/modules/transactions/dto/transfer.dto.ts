import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  receiver_phone_number: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
