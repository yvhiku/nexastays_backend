import { IsOptional, IsNumber, Min } from 'class-validator';

export class CompleteRideDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  final_distance_km?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  final_duration_min?: number;
}
