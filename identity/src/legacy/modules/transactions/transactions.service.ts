import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AppTransaction } from './entities/app-transaction.entity';
import { TransactionFee } from './entities/transaction-fee.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { TransferDto } from './dto/transfer.dto';
import { LedgerService } from '../ledger/ledger.service';
import { appConfig } from '../../common/config/app.config';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { FraudService } from '../fraud/fraud.service';
import { EMIService, EMIOperationStatus } from '../emi';
import { RpCashbackProgramService } from '../rewards-program/rp-cashback-program.service';
import { MoneyMovementIdempotencyService } from '../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';
import {
  appTransactionTypeToOperation,
  KycPolicyValidationService,
} from '../compliance/kyc-policy/kyc-policy-validation.service';

export interface TransactionDeviceContext {
  device_id?: string;
  device_integrity?: string;
  user_agent?: string;
}

/**
 * `app_transactions.created_at` uses PostgreSQL TIMESTAMP (no time zone).
 * Raw SQL / drivers may return strings without offsets; clients then mis-parse
 * as device-local wall time. Always serialize as UTC RFC3339 ending in `Z`.
 */
function toIso8601UtcInstant(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? new Date().toISOString()
      : d.toISOString();
  }

  let s = String(value ?? '').trim();
  if (!s) return new Date().toISOString();

  if (/Z$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (
    /[+-]\d{2}:\d{2}(?::\d{2})?$/.test(s) ||
    /[+-]\d{4}$/.test(s) ||
    /[+-]\d{2}$/.test(s)
  ) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  if (!s.includes('T')) {
    s = s.replace(/\s+/u, 'T');
  } else {
    s = s.replace(/\s+/g, '');
  }
  const withZ = s.endsWith('Z') || s.endsWith('z') ? s : `${s}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(AppTransaction)
    private readonly transactionRepository: Repository<AppTransaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly ledgerService: LedgerService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly fraudService: FraudService,
    private readonly dataSource: DataSource,
    private readonly emiService: EMIService,
    private readonly rpCashbackProgramService: RpCashbackProgramService,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
    private readonly kycPolicyValidation: KycPolicyValidationService,
  ) {}

  async getTransactions(page = 1, limit = 20, userId: string) {
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .leftJoin(User, 'sender', 'sender.id = t.sender_user_id')
      .leftJoin(User, 'receiver', 'receiver.id = t.receiver_user_id')
      .select([
        't.id as id',
        't.sender_user_id as sender_user_id',
        't.receiver_user_id as receiver_user_id',
        't.amount as amount',
        't.type as type',
        't.status as status',
        't.reference as reference',
        't.created_at as created_at',
        'sender.full_name as sender_name',
        'sender.phone_number as sender_phone',
        'receiver.full_name as receiver_name',
        'receiver.phone_number as receiver_phone',
      ])
      .where('(t.sender_user_id = :userId OR t.receiver_user_id = :userId)', {
        userId,
      })
      .orderBy('t.created_at', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    const rows = await qb.getRawMany();
    return rows.map((row) => {
      // Preserve TOPUP, WITHDRAW, and Go Services types (TAXI_RIDE, FOOD_ORDER).
      // Only map incoming TRANSFER to RECEIVE for display.
      const isIncoming = row.receiver_user_id === userId;
      const originalType = row.type;
      const isGoService =
        originalType === 'TAXI_RIDE' || originalType === 'FOOD_ORDER';
      const type =
        isIncoming && !isGoService && originalType === 'TRANSFER'
          ? 'RECEIVE'
          : originalType;

      const isSubscriptionPro = originalType === 'SUBSCRIPTION_PRO';
      return {
        id: row.id,
        sender_user_id: row.sender_user_id,
        receiver_user_id: row.receiver_user_id,
        sender_name: row.sender_name,
        sender_phone: row.sender_phone,
        receiver_name: isSubscriptionPro
          ? 'PRO SUBSCRIPTION'
          : row.receiver_name,
        receiver_phone: isSubscriptionPro ? null : row.receiver_phone,
        amount: Number(row.amount),
        type: type,
        status: row.status,
        reference: row.reference,
        description: isSubscriptionPro
          ? 'Nexa Pro subscription'
          : row.reference,
        created_at: toIso8601UtcInstant(row.created_at),
      };
    });
  }

  async transfer(
    senderUserId: string,
    payload: TransferDto,
    deviceContext: TransactionDeviceContext | null | undefined,
    idempotencyKey: string,
  ) {
    return this.transferWithType(
      senderUserId,
      payload,
      'TRANSFER',
      'P2P transfer',
      idempotencyKey,
      MoneyMovementScope.P2P_TRANSFER,
      deviceContext,
    );
  }

  async transferWithType(
    senderUserId: string,
    payload: TransferDto,
    type: string,
    description: string,
    idempotencyKey: string,
    scope: MoneyMovementScope,
    deviceContext?: TransactionDeviceContext | null,
  ) {
    const payloadWithKey: TransferDto = {
      ...payload,
      idempotency_key: idempotencyKey,
    };
    return this.moneyMovementIdempotency.runInTransaction(
      this.dataSource,
      {
        scope,
        actorUserId: senderUserId,
        idempotencyKey,
        requestPayload: payloadWithKey,
      },
      (manager) =>
        this.executeTransferWithManager(
          manager,
          senderUserId,
          payloadWithKey,
          type,
          description,
          deviceContext,
        ),
    );
  }

  /**
   * Ledger + EMI transfer executed inside an existing DB transaction (e.g. QR consume).
   * Outer layers must enforce idempotency / payments UX.
   */
  async executeTransferWithManager(
    manager: EntityManager,
    senderUserId: string,
    payload: TransferDto,
    type: string,
    description: string,
    deviceContext?: TransactionDeviceContext | null,
  ) {
    await this.usersService.ensureMandatoryConsentsAccepted(senderUserId);
    const userRepo = manager.getRepository(User);
    const walletRepo = manager.getRepository(Wallet);
    const txRepo = manager.getRepository(AppTransaction);

    const sender = await userRepo.findOne({ where: { id: senderUserId } });
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    if (sender.status === 'DELETION_PENDING') {
      throw new BadRequestException(
        'Account deletion is pending. Transfers are disabled.',
      );
    }

    if (sender.status === 'FROZEN') {
      throw new BadRequestException(
        'Account is frozen. Please contact support.',
      );
    }

    const senderWallet = await walletRepo.findOne({
      where: { user_id: sender.id },
    });
    if (!senderWallet) {
      throw new NotFoundException('Sender wallet not found');
    }
    if (senderWallet.status === 'LOCKED' || senderWallet.status === 'FROZEN') {
      throw new BadRequestException(
        'Wallet is locked. Please contact support.',
      );
    }

    const receiver = await userRepo.findOne({
      where: { phone_number: payload.receiver_phone_number },
    });
    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    if (sender.id === receiver.id) {
      throw new BadRequestException('Cannot send money to the same wallet');
    }

    if (payload.amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (payload.amount > appConfig.maxSingleTransfer) {
      throw new BadRequestException('Amount exceeds max single transfer');
    }

    const idempotencyKey = payload.idempotency_key;
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_MISSING',
        message: 'Internal: idempotency key is required on transfer payload',
      });
    }

    let reference =
      payload.reference ??
      `TXN-${Date.now()}-${Math.floor(Math.random() * 99)}`;
    let attempts = 0;
    while (
      (await txRepo.findOne({ where: { reference } })) &&
      attempts < 3
    ) {
      attempts += 1;
      reference = `${reference}-${Date.now()}`;
    }

    const senderWalletInTx = await walletRepo.findOne({
      where: { user_id: sender.id },
    });
    const receiverWallet = await walletRepo.findOne({
      where: { user_id: receiver.id },
    });
    if (!senderWalletInTx || !receiverWallet) {
      if (!senderWalletInTx) {
        throw new NotFoundException('Sender wallet not found');
      }
      throw new NotFoundException('Receiver wallet not found');
    }

    const senderAccount = await this.ledgerService.getOrCreateWalletAccount(
      senderWalletInTx.id,
      manager,
    );

    await manager
      .getRepository(LedgerAccount)
      .createQueryBuilder('la')
      .where('la.id = :id', { id: senderAccount.id })
      .setLock('pessimistic_write')
      .getOne();

    const senderBalance = await this.ledgerService.getBalance(
      senderAccount.id,
      manager,
    );
    if (senderBalance < payload.amount) {
      throw new BadRequestException('Insufficient funds');
    }

    await this.kycPolicyValidation.assertMoneyMovementAllowed({
      manager,
      actorUserId: sender.id,
      operation: appTransactionTypeToOperation(type),
      amountMad: payload.amount,
      ledgerAccountId: senderAccount.id,
      ledgerBalanceMad: senderBalance,
      receiver: { id: receiver.id, account_type: receiver.account_type },
      auditContext: { app_transaction_type: type },
    });

    const fraudDecision = await this.fraudService.evaluateTransactionRisk(
      {
        sender_user_id: sender.id,
        amount: payload.amount,
        transaction_type: type,
        transaction_reference: reference,
        device_id: deviceContext?.device_id,
        device_context: {
          device_id: deviceContext?.device_id,
          device_integrity: deviceContext?.device_integrity,
          user_agent: deviceContext?.user_agent,
        },
      },
      senderBalance,
    );
    if (fraudDecision.blocked) {
      throw new BadRequestException({
        code: 'FRAUD_BLOCKED',
        message: 'Transaction blocked by fraud policy',
        reasons: fraudDecision.events.map((event) => event.reason_code),
      });
    }

    const appTransaction = await txRepo.save({
      sender_user_id: sender.id,
      receiver_user_id: receiver.id,
      amount: payload.amount,
      type,
      status: 'PENDING',
      reference,
      idempotency_key: idempotencyKey,
    });

    const useMerchantTapPayment =
      (type === 'QR_PAYMENT' || type === 'NFC_PAYMENT') &&
      receiver.account_type === 'MERCHANT';

    let merchantFeeApplied = 0;

    let emiResponse:
      | Awaited<ReturnType<EMIService['initiateMerchantPayment']>>
      | Awaited<ReturnType<EMIService['initiateTransfer']>>;

    if (useMerchantTapPayment) {
      const bps = appConfig.qrMerchantFeeBps;
      merchantFeeApplied = Number(
        Math.min(payload.amount, (payload.amount * bps) / 10000).toFixed(2),
      );
      emiResponse = await this.emiService.initiateMerchantPayment(
        {
          idempotency_key: idempotencyKey,
          payer_user_id: sender.id,
          payer_wallet_id: senderWalletInTx.id,
          merchant_user_id: receiver.id,
          merchant_wallet_id: receiverWallet.id,
          amount: payload.amount,
          currency: 'MAD',
          fee_amount: merchantFeeApplied > 0 ? merchantFeeApplied : undefined,
          description,
          merchant_reference: reference,
          metadata: {
            nexapay: { app_transaction_type: type },
          },
        },
        manager,
      );
    } else {
      emiResponse = await this.emiService.initiateTransfer(
        {
          idempotency_key: idempotencyKey,
          sender_user_id: sender.id,
          sender_wallet_id: senderWalletInTx.id,
          receiver_user_id: receiver.id,
          receiver_wallet_id: receiverWallet.id,
          amount: payload.amount,
          currency: 'MAD',
          description,
          reference,
        },
        manager,
      );
    }

    if (emiResponse.status === EMIOperationStatus.FAILED) {
      this.logger.error(
        `[Transfer] EMI failed: ${emiResponse.error?.code} - ${emiResponse.error?.message}`,
      );
      throw new BadRequestException(
        emiResponse.error?.message ?? 'Transfer failed',
      );
    }

    appTransaction.status = 'COMPLETED';
    if (emiResponse.ledger_transaction_id) {
      appTransaction.ledger_transaction_id = emiResponse.ledger_transaction_id;
    }
    await txRepo.save(appTransaction);

    if (merchantFeeApplied > 0) {
      await manager.getRepository(TransactionFee).save({
        app_transaction_id: appTransaction.id,
        amount: merchantFeeApplied,
      });
    }

    try {
      const merchantName = receiver.full_name ?? receiver.phone_number ?? null;
      await this.rpCashbackProgramService.processPaymentConfirmed({
        sourceTransactionId: appTransaction.id,
        userId: sender.id,
        amount: Number(appTransaction.amount),
        categoryId: null,
        merchantName,
        transactionDate: appTransaction.created_at,
        transactionType: type,
      });
    } catch (err) {
      this.logger.warn(
        `[RewardsProgram] processPaymentConfirmed failed: ${(err as Error).message}`,
      );
    }

    await this.notificationsService
      .sendToUser(sender.id, {
        title: 'Payment sent',
        body: `Ref ${reference}: You sent ${payload.amount.toFixed(2)} MAD`,
        reference,
        amount: payload.amount.toFixed(2),
        direction: 'sent',
        event: type,
      })
      .catch(() => {});
    const receivedAmountMad = useMerchantTapPayment
      ? Number((payload.amount - merchantFeeApplied).toFixed(2))
      : payload.amount;

    await this.notificationsService
      .sendToUser(receiver.id, {
        title: 'Payment received',
        body: `Ref ${reference}: You received ${receivedAmountMad.toFixed(2)} MAD`,
        reference,
        amount: receivedAmountMad.toFixed(2),
        direction: 'received',
        event: type,
      })
      .catch(() => {});

    return this.transferResultPayload(
      appTransaction,
      sender,
      receiver,
      description,
      null,
      merchantFeeApplied,
    );
  }

  /** JSON shape expected by the Nexa Pay mobile client (`Transaction.fromJson`). */
  private transferResultPayload(
    tx: AppTransaction,
    senderUser: User,
    receiverUser: User,
    description: string,
    cashback: {
      id: string;
      cashbackAmount: number;
      cashbackPercentage: number;
      status: string;
    } | null,
    feeAppliedMad = 0,
  ) {
    const createdAt = toIso8601UtcInstant(tx.created_at);
    return {
      id: tx.id,
      sender_user_id: tx.sender_user_id,
      receiver_user_id: tx.receiver_user_id,
      sender_name: senderUser.full_name ?? null,
      sender_phone: senderUser.phone_number ?? null,
      receiver_name: receiverUser.full_name ?? null,
      receiver_phone: receiverUser.phone_number ?? null,
      amount: Number(tx.amount),
      fee: feeAppliedMad,
      type: tx.type,
      status: tx.status,
      reference: tx.reference,
      description,
      created_at: createdAt,
      transaction_id: tx.id,
      ledger_transaction_id: tx.ledger_transaction_id ?? null,
      cashback,
    };
  }
}
