import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { User } from '../users/entities/user.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { IdentitySnapshotService } from './identity-snapshot.service';
import { IdentitySnapshotController } from './identity-snapshot.controller';

@Module({
  imports: [
    CommonCacheModule,
    TypeOrmModule.forFeature([User, KycProfile]),
  ],
  controllers: [IdentitySnapshotController],
  providers: [IdentitySnapshotService],
  exports: [IdentitySnapshotService],
})
export class IdentitySnapshotModule {}
