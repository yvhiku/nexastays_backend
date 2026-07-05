import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class SelectCategoriesDto {
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  categoryIds: number[];
}
