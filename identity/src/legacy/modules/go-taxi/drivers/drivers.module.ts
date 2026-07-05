import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverAvailability } from './entities/driver-availability.entity';
import { RegistrationApplication } from '../entities/registration-application.entity';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverProfile, DriverAvailability, RegistrationApplication, User]),
    UsersModule,
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService, TypeOrmModule],
})
export class DriversModule {}
