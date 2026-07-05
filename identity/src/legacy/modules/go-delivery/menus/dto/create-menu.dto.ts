import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMenuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
