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
import { NotificationsService } from '../notifications/notifications.service';
import { QrGenerateDto } from './dto/qr-generate.dto';
import { QrPayDto } from './dto/qr-pay.dto';
import { QrPayment } from './entities/qr-payment.entity';
import { MoneyMovementIdempotencyService } from '../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';

@Injectable()
export class QrService {
  constructor(
    @InjectRepository(QrPayment)
    private readonly qrRepository: Repository<QrPayment>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
  ) {}

  private signPayload(payload: string) {
    return crypto
      .createHmac('sha256', appConfig.qrSigningSecret)
      .update(payload)
      .digest('hex');
  }

  async generate(payload: QrGenerateDto) {
    const reference = `QR-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const qrPayload = JSON.stringify({
      merchant_phone_number: payload.merchant_phone_number,
      amount: payload.amount ?? null,
      reference,
      expires_at: expiresAt.toISOString(),
    });
    const signature = this.signPayload(qrPayload);

    await this.qrRepository.save({
      merchant_phone_number: payload.merchant_phone_number,
      amount: payload.amount ?? null,
      payload: qrPayload,
      signature,
      expires_at: expiresAt,
      consumed_at: null,
    });

    return {
      payload: qrPayload,
      signature,
      expires_at: expiresAt,
      reference,
    };
  }

  async pay(
    payerUserId: string,
    payload: QrPayDto,
    idempotencyKey: string,
    deviceContext?: TransactionDeviceContext | null,
  ) {
    let parsed: Record<string, unknown> = {};
    try {
      const result = await this.moneyMovementIdempotency.runInTransaction(
        this.dataSource,
        {
          scope: MoneyMovementScope.QR_PAYMENT,
          actorUserId: payerUserId,
          idempotencyKey,
          requestPayload: payload,
        },
        async (manager) => {
          const expected = this.signPayload(payload.payload);
          if (expected !== payload.signature) {
            throw new BadRequestException('Invalid QR signature');
          }

          const record = await manager.getRepository(QrPayment).findOne({
            where: { payload: payload.payload, signature: payload.signature },
            lock: { mode: 'pessimistic_write' },
          });
          if (!record) {
            throw new NotFoundException('QR not found');
          }
          if (record.consumed_at) {
            throw new BadRequestException('QR already used');
          }
          if (record.expires_at.getTime() < Date.now()) {
            throw new BadRequestException('QR expired');
          }

          parsed = JSON.parse(payload.payload) as Record<string, unknown>;
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
              'QR_PAYMENT',
              'QR payment',
              deviceContext,
            );

          record.consumed_at = new Date();
          await manager.getRepository(QrPayment).save(record);
          return transferResult;
        },
      );

      await this.notificationsService
        .sendToUser(payerUserId, {
          title: 'QR payment successful',
          body: `Ref ${String(parsed.reference ?? '')}: Paid ${Number(payload.amount ?? parsed.amount ?? 0).toFixed(2)} MAD`,
          reference: String(parsed.reference ?? ''),
          amount: Number(payload.amount ?? parsed.amount ?? 0).toFixed(2),
          direction: 'sent',
          event: 'QR_PAYMENT_SUCCESS',
        })
        .catch(() => {});
      return result;
    } catch (error) {
      await this.notificationsService
        .sendToUser(payerUserId, {
          title: 'QR payment failed',
          body:
            parsed.reference != null
              ? `Ref ${String(parsed.reference)}: Payment could not be completed`
              : 'QR payment could not be completed',
          reference: parsed.reference != null ? String(parsed.reference) : '',
          amount:
            parsed.amount != null ? Number(parsed.amount).toFixed(2) : '',
          direction: 'sent',
          event: 'QR_PAYMENT_FAILED',
        })
        .catch(() => {});
      throw error;
    }
  }
}
