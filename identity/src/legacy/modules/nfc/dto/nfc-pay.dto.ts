import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class NfcPayDto {
  @IsString()
  @IsNotEmpty()
  payload: string;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}
