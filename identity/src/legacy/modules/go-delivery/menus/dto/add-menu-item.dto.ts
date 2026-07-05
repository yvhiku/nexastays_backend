import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class AddMenuItemDto {
  @IsUUID()
  @IsNotEmpty()
  menu_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  price: number;
}
