import { IsIn } from 'class-validator';

export class UpdateVisibilityDto {
  @IsIn(['archive', 'delete', 'restore'])
  action: 'archive' | 'delete' | 'restore';
}
