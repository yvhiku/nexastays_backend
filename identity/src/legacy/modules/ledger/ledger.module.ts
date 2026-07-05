import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { LedgerPostingService } from './ledger-posting.service';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerTransaction } from './entities/ledger-transaction.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerAccount, LedgerTransaction, LedgerEntry]),
  ],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerPostingService],
  exports: [LedgerService, LedgerPostingService, TypeOrmModule],
})
export class LedgerModule {}
