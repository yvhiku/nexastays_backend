import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityEventsService } from './security-events.service';
import { SecurityEventsController } from './security-events.controller';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityEvent]), AuthzModule],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsService],
  exports: [SecurityEventsService, TypeOrmModule],
})
export class SecurityEventsModule {}
