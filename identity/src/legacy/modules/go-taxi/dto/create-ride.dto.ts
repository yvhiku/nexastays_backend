import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateRideDto {
  @IsOptional()
  @IsString()
  pickup_location?: string;

  @IsOptional()
  @IsString()
  dropoff_location?: string;

  @IsNumber()
  @Min(0.01)
  fare_amount: number;

  /** Ride type for fare verification: economy | comfort | moto */
  @IsOptional()
  @IsString()
  @IsIn(['economy', 'comfort', 'moto'])
  ride_type?: string;

  /** Pickup latitude (for fare verification when ride_type provided) */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickup_lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickup_lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoff_lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoff_lng?: number;

  /** Route distance km (from Directions API, for verification) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_km?: number;

  /** Route duration minutes (for verification) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_min?: number;
}
