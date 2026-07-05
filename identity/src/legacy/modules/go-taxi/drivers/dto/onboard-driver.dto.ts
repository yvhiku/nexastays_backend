import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { VehicleType } from '../../enums/vehicle-type.enum';

export class OnboardDriverDto {
  @IsEnum(VehicleType)
  @IsNotEmpty()
  vehicle_type: VehicleType;

  @IsString()
  @IsNotEmpty()
  vehicle_plate: string;
}
