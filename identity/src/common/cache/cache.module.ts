import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { HttpCacheInterceptor } from './http-cache.interceptor';

@Module({
  imports: [
    NestCacheModule.register({
      ttl: 60 * 1000, // 60 seconds default, in ms
      max: 1000,
    }),
  ],
  providers: [HttpCacheInterceptor],
  exports: [NestCacheModule, HttpCacheInterceptor],
})
export class CommonCacheModule {}
