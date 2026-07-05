import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionService } from './commissions.service';
import { CommissionRule } from '../entities/commission-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionRule])],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionsModule {}
