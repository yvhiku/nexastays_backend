import { IsNotEmpty, IsNumber } from 'class-validator';

export class WithdrawDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
