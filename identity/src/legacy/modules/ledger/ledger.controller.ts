import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LedgerService } from './ledger.service';

@ApiTags('Pay Wallets')
@Controller(['ledger', 'pay/ledger'])
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}
}
