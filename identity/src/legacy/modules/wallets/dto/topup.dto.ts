import { IsNotEmpty, IsNumber } from 'class-validator';

export class TopupDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
