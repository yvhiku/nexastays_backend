import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { IdentityJwtStrategy } from './identity-jwt.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [IdentityJwtStrategy],
  exports: [PassportModule],
})
export class IdentityAuthModule {}
