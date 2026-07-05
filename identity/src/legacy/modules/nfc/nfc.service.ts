import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { appConfig } from '../../common/config/app.config';
import { TransactionsService } from '../transactions/transactions.service';
import type { TransactionDeviceContext } from '../transactions/transactions.service';
import { NfcPrepareDto } from './dto/nfc-prepare.dto';
import { NfcPayDto } from './dto/nfc-pay.dto';
import { NfcToken } from './entities/nfc-token.entity';
import { MoneyMovementIdempotencyService } from '../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';

@Injectable()
export class NfcService {
  constructor(
    @InjectRepository(NfcToken)
    private readonly nfcRepository: Repository<NfcToken>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
  ) {}

  private signPayload(payload: string) {
    return crypto
      .createHmac('sha256', appConfig.nfcSigningSecret)
      .update(payload)
      .digest('hex');
  }

  async prepare(payload: NfcPrepareDto) {
    const reference = `NFC-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    const tokenPayload = JSON.stringify({
      merchant_phone_number: payload.merchant_phone_number,
      amount: payload.amount ?? null,
      reference,
      expires_at: expiresAt.toISOString(),
    });
    const signature = this.signPayload(tokenPayload);

    await this.nfcRepository.save({
      merchant_phone_number: payload.merchant_phone_number,
      amount: payload.amount ?? null,
      payload: tokenPayload,
      signature,
      expires_at: expiresAt,
      consumed_at: null,
    });

    return {
      payload: tokenPayload,
      signature,
      expires_at: expiresAt,
      reference,
    };
  }

  async pay(
    payerUserId: string,
    payload: NfcPayDto,
    idempotencyKey: string,
    deviceContext?: TransactionDeviceContext | null,
  ) {
    return this.moneyMovementIdempotency.runInTransaction(
      this.dataSource,
      {
        scope: MoneyMovementScope.NFC_PAYMENT,
        actorUserId: payerUserId,
        idempotencyKey,
        requestPayload: payload,
      },
      async (manager) => {
        const expected = this.signPayload(payload.payload);
        if (expected !== payload.signature) {
          throw new BadRequestException('Invalid NFC signature');
        }

        const record = await manager.getRepository(NfcToken).findOne({
          where: { payload: payload.payload, signature: payload.signature },
          lock: { mode: 'pessimistic_write' },
        });
        if (!record) {
          throw new NotFoundException('NFC token not found');
        }
        if (record.consumed_at) {
          throw new BadRequestException('NFC token already used');
        }
        if (record.expires_at.getTime() < Date.now()) {
          throw new BadRequestException('NFC token expired');
        }

        const parsed = JSON.parse(payload.payload) as Record<string, unknown>;
        const amount = parsed.amount ?? payload.amount;
        if (!amount || Number(amount) <= 0) {
          throw new BadRequestException('Amount is required');
        }
        if (
          parsed.amount != null &&
          payload.amount != null &&
          Number(parsed.amount) !== Number(payload.amount)
        ) {
          throw new BadRequestException('Amount mismatch');
        }

        const transferResult =
          await this.transactionsService.executeTransferWithManager(
            manager,
            payerUserId,
            {
              receiver_phone_number: String(parsed.merchant_phone_number),
              amount: Number(amount),
              reference: parsed.reference as string | undefined,
              idempotency_key: idempotencyKey,
            },
            'NFC_PAYMENT',
            'NFC payment',
            deviceContext,
          );

        record.consumed_at = new Date();
        await manager.getRepository(NfcToken).save(record);
        return transferResult;
      },
    );
  }
}
