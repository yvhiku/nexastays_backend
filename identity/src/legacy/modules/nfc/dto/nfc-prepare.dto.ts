import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class NfcPrepareDto {
  @IsString()
  @IsNotEmpty()
  merchant_phone_number: string;

  @IsOptional()
  @IsNumber()
  amount?: number;
}
