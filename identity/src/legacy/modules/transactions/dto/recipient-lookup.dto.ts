import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class RecipientLookupDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}

export class RecipientBatchMatchDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  phone_numbers: string[];
}
