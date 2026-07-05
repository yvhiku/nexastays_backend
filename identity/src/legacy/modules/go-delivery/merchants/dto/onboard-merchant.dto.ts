import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OnboardMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
