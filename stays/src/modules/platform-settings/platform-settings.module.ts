import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysPlatformSettings } from './stays-platform-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StaysPlatformSettings])],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
