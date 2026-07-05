import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class RequestRideDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  pickup_lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  pickup_lng: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  dropoff_lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  dropoff_lng: number;
}
