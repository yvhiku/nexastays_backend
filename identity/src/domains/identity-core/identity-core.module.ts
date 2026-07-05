import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { UsersModule } from '../../modules/users/users.module';
import { JwksModule } from '../../modules/jwks/jwks.module';
import { SmsModule } from '../../modules/sms/sms.module';

/**
 * Identity Core — auth, users, JWT issuing, JWKS.
 * Single deployable service; internal bounded context for team ownership.
 */
@Module({
  imports: [AuthModule, UsersModule, JwksModule, SmsModule],
  exports: [AuthModule, UsersModule, JwksModule, SmsModule],
})
export class IdentityCoreModule {}
