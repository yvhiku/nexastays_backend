import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationApplication } from '../entities/registration-application.entity';
import { RegistrationApplicationsService } from './registration-applications.service';
import { RegistrationApplicationsController } from './registration-applications.controller';
import { UsersModule } from '../../users/users.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RegistrationApplication]),
    UsersModule,
    DriversModule,
  ],
  controllers: [RegistrationApplicationsController],
  providers: [RegistrationApplicationsService],
  exports: [RegistrationApplicationsService],
})
export class RegistrationApplicationsModule {}
