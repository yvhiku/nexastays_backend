import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export enum ServiceClass {
  ECONOMY = 'ECONOMY',
}

export class QuoteRideDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  pickup_lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  pickup_lng: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-90)
  @Max(90)
  dropoff_lat: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(-180)
  @Max(180)
  dropoff_lng: number;

  @IsOptional()
  @IsEnum(ServiceClass)
  service_class?: ServiceClass;
}
