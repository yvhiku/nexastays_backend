import { IsIn } from 'class-validator';

export class UpdateSarStatusDto {
  @IsIn(['OPEN', 'UNDER_REVIEW', 'REPORTED', 'DISMISSED'])
  status: 'OPEN' | 'UNDER_REVIEW' | 'REPORTED' | 'DISMISSED';
}
