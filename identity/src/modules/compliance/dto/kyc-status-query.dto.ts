import { IsNotEmpty, IsString } from 'class-validator';

export class KycStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
