import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { PushDeviceToken } from './entities/push-device-token.entity';
import { UserNotification } from './entities/user-notification.entity';
import { NotificationsService } from './notifications.service';
import { UserNotificationsService } from './user-notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([PushDeviceToken, UserNotification]), CommonCacheModule],
  controllers: [],
  providers: [NotificationsService, UserNotificationsService],
  exports: [NotificationsService, UserNotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
