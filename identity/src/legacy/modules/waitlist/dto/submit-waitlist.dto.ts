import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitWaitlistDto {
  @ApiProperty({ example: 'Ahmed Benali' })
  @IsString()
  @MinLength(1, { message: 'Full name is required' })
  @MaxLength(255)
  full_name: string;

  @ApiProperty({ example: '+212612345678' })
  @IsString()
  @MinLength(1, { message: 'Phone number is required' })
  @MaxLength(50)
  phone_number: string;

  @ApiProperty({
    example: 'Casablanca',
    description: 'User city',
  })
  @IsString()
  @MinLength(1, { message: 'City is required' })
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'I want to use Nexa for daily payments and transfers.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  how_will_use_nexa?: string;

  @ApiPropertyOptional({
    example: 'nexa_go_web_public',
    description: 'Source app/website that submitted this lead',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({
    example: 'consumer',
    description: 'Lead type for waitlist sources that collect it',
  })
  @IsOptional()
  @IsString()
  @IsIn(['consumer', 'merchant', 'investor', 'rider', 'driver_courier', 'merchant_partner'], {
    message: 'user_type must be one of: consumer, merchant, investor, rider, driver_courier, merchant_partner',
  })
  user_type?: string;
}
