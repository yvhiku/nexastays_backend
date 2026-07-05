import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityEventsService } from './security-events.service';
import { SecurityEventsController } from './security-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SecurityEvent])],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsService],
  exports: [SecurityEventsService, TypeOrmModule],
})
export class SecurityEventsModule {}
