import { IsOptional, IsNumber, Min } from 'class-validator';

export class CompleteRideDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  final_distance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  final_time?: number;
}
