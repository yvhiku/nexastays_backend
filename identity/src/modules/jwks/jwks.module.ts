import { Global, Module } from '@nestjs/common';
import { JwtKeysService } from './jwt-keys.service';
import { JwksController } from './jwks.controller';

@Global()
@Module({
  controllers: [JwksController],
  providers: [JwtKeysService],
  exports: [JwtKeysService],
})
export class JwksModule {}
