import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { appConfig } from '../../common/config/app.config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { LedgerService } from '../ledger/ledger.service';
import { User } from '../users/entities/user.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerPostingService } from '../ledger/ledger-posting.service';
import { KycPolicyValidationService } from '../compliance/kyc-policy/kyc-policy-validation.service';
import { TopupDto } from './dto/topup.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { RequestCoalescingService } from '../../common/coalescing/request-coalescing.service';
import { MetricsService } from '../../common/metrics';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { MoneyMovementIdempotencyService } from '../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';
import { EMIService, EMIOperationStatus } from '../emi';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AppTransaction)
    private readonly transactionRepository: Repository<AppTransaction>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountRepository: Repository<LedgerAccount>,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
    private readonly coalescing: RequestCoalescingService,
    private readonly metricsService: MetricsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly emiService: EMIService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
    private readonly kycPolicyValidation: KycPolicyValidationService,
  ) {}

  /** Blocks cash-in/out when EMI is not mock and real settlement flag is off. */
  private assertCashInOutProviderAllowed(): void {
    const t = String(process.env.EMI_PROVIDER_TYPE || 'mock')
      .trim()
      .toLowerCase();
    if (t === 'mock') {
      return;
    }
    if (!appConfig.realPaySettlementEnabled) {
      throw new ForbiddenException({
        code: 'REAL_SETTLEMENT_DISABLED',
        message:
          'Top-up and withdrawal via external EMI are disabled until settlement is explicitly enabled.',
      });
    }
  }

  async getWallet(phoneNumber?: string): Promise<Wallet> {
    const qb = this.walletRepository
      .createQueryBuilder('w')
      .leftJoin('w.user', 'u')
      .orderBy('w.created_at', 'ASC');

    if (phoneNumber) {
      qb.where('u.phone_number = :phoneNumber', { phoneNumber });
    }

    const wallet = await qb.getOne();
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getBalance(phoneNumber?: string): Promise<number> {
    const wallet = await this.getWallet(phoneNumber);
    const account = await this.ledgerService.getOrCreateWalletAccount(
      wallet.id,
    );
    return this.ledgerService.getBalance(account.id);
  }

  async getBalanceByUserId(
    userId: string,
    accountType?: string,
    linkedUserId?: string | null,
  ): Promise<number> {
    const key = `balance:${userId}:${accountType ?? 'CONSUMER'}`;
    return this.coalescing.coalesce(key, async () => {
      this.metricsService.incrementDbQuery();
      try {
        return await this.getBalanceByUserIdInternal(
          userId,
          accountType,
          linkedUserId,
        );
      } catch (err) {
        this.metricsService.incrementDbQueryFailure();
        throw err;
      }
    });
  }

  private async getBalanceByUserIdInternal(
    userId: string,
    accountType?: string,
    _linkedUserId?: string | null,
  ): Promise<number> {
    await this.usersService.ensureMandatoryConsentsAccepted(userId);

    let wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });

    if (!wallet) {
      wallet = await this.ensureWalletForUserId(userId);
    }

    const allAccounts = await this.ledgerAccountRepository.find({
      where: { wallet_id: wallet.id },
    });

    if (allAccounts.length > 1) {
      let totalBalance = 0;
      for (const acc of allAccounts) {
        const accBalance = await this.ledgerService.getBalance(acc.id);
        totalBalance += accBalance;
      }
      return totalBalance;
    }

    const account = await this.ledgerService.getOrCreateWalletAccount(
      wallet.id,
    );
    return this.ledgerService.getBalance(account.id);
  }

  /**
   * Debug method to get wallet information
   */
  async getWalletDebugInfo(userId: string, accountType?: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['linked_user'],
    });

    const wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });

    let accounts: LedgerAccount[] = [];
    let totalBalance = 0;
    if (wallet) {
      accounts = await this.ledgerAccountRepository.find({
        where: { wallet_id: wallet.id },
      });

      for (const acc of accounts) {
        const accBalance = await this.ledgerService.getBalance(acc.id);
        totalBalance += accBalance;
      }
    }

    return {
      userId,
      accountType,
      user: user
        ? {
            id: user.id,
            phone_number: user.phone_number,
            full_name: user.full_name,
            account_type: user.account_type,
            linked_user_id: user.linked_user_id,
          }
        : null,
      wallet: wallet
        ? {
            id: wallet.id,
            user_id: wallet.user_id,
            currency: wallet.currency,
            status: wallet.status,
            created_at: wallet.created_at,
          }
        : null,
      ledgerAccounts: accounts.map((acc) => ({
        id: acc.id,
        wallet_id: acc.wallet_id,
        account_type: acc.account_type,
        created_at: acc.created_at,
      })),
      totalBalance,
    };
  }

  async getWalletByUserId(userId: string) {
    const wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  /**
   * Get or create wallet for user (e.g. driver receiving ride payout).
   * Creates wallet + ledger account if missing.
   */
  async ensureWalletForUserId(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });
    if (wallet) {
      console.log(
        `[WalletsService] Existing wallet found: ${wallet.id} for user ${userId}`,
      );
      return wallet;
    }
    console.log(`[WalletsService] Creating new wallet for user ${userId}`);
    wallet = await this.walletRepository.save({
      user_id: userId,
      currency: 'MAD',
      status: 'ACTIVE',
    });
    console.log(
      `[WalletsService] Created wallet: ${wallet.id} for user ${userId}`,
    );
    await this.ledgerService.getOrCreateWalletAccount(wallet.id);
    console.log(
      `[WalletsService] Created ledger account for wallet ${wallet.id}`,
    );
    return wallet;
  }

  // Removed getUserByPhone - use userId from JWT instead

  async topup(userId: string, body: TopupDto, idempotencyKey: string) {
    await this.usersService.ensureMandatoryConsentsAccepted(userId);
    this.assertCashInOutProviderAllowed();

    const amount = body.amount;
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const wallet = await this.getWalletByUserId(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === 'DELETION_PENDING') {
      throw new BadRequestException(
        'Account deletion is pending. Wallet operations are disabled.',
      );
    }

    if (wallet.status === 'LOCKED' && user.status !== 'FROZEN') {
      throw new BadRequestException(
        'Wallet is locked. Please contact support.',
      );
    }

    try {
      return await this.moneyMovementIdempotency.runInTransaction(
        this.dataSource,
        {
          scope: MoneyMovementScope.TOPUP,
          actorUserId: userId,
          idempotencyKey,
          requestPayload: body,
        },
        async (manager) => {
          const walletAccount = await this.ledgerService.getOrCreateWalletAccount(
            wallet.id,
            manager,
          );
          const balance = await this.ledgerService.getBalance(
            walletAccount.id,
            manager,
          );
          await this.kycPolicyValidation.assertMoneyMovementAllowed({
            manager,
            actorUserId: user.id,
            operation: 'TOPUP',
            amountMad: amount,
            ledgerAccountId: walletAccount.id,
            ledgerBalanceMad: balance,
            receiver: null,
          });

          const reference = `TOPUP-${Date.now()}`;
          const appTransaction = await manager.getRepository(AppTransaction).save({
            sender_user_id: null,
            receiver_user_id: user.id,
            amount: amount,
            type: 'TOPUP',
            status: 'PENDING',
            reference,
            idempotency_key: idempotencyKey,
          });

          const emiResponse = await this.emiService.initiateTopUp(
            {
              idempotency_key: idempotencyKey,
              user_id: userId,
              wallet_id: wallet.id,
              amount: amount,
              currency: 'MAD',
              source: { type: 'INTERNAL' },
            },
            manager,
          );

          if (emiResponse.status === EMIOperationStatus.FAILED) {
            throw new BadRequestException(
              emiResponse.error?.message ?? 'Top-up failed',
            );
          }

          appTransaction.status = 'COMPLETED';
          if (emiResponse.ledger_transaction_id) {
            appTransaction.ledger_transaction_id =
              emiResponse.ledger_transaction_id;
          }
          await manager.getRepository(AppTransaction).save(appTransaction);

          await this.notificationsService
            .sendToUser(user.id, {
              title: 'Topup completed',
              body: `Ref ${reference}: Topup ${amount.toFixed(2)} MAD completed`,
              reference,
              amount: amount.toFixed(2),
              direction: 'received',
              event: 'TOPUP_COMPLETED',
            })
            .catch(() => {});
          return appTransaction;
        },
      );
    } catch (error) {
      await this.notificationsService
        .sendToUser(user.id, {
          title: 'Topup failed',
          body: `Topup ${amount.toFixed(2)} MAD could not be completed`,
          reference: '',
          amount: amount.toFixed(2),
          direction: 'received',
          event: 'TOPUP_FAILED',
        })
        .catch(() => {});
      throw error;
    }
  }

  async withdraw(
    userId: string,
    body: WithdrawDto,
    idempotencyKey: string,
    beneficiary?: {
      bank_code: string;
      account_number: string;
      account_holder_name: string;
    },
  ) {
    await this.usersService.ensureMandatoryConsentsAccepted(userId);
    this.assertCashInOutProviderAllowed();

    const amount = body.amount;
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const wallet = await this.getWalletByUserId(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === 'DELETION_PENDING') {
      throw new BadRequestException(
        'Account deletion is pending. Wallet operations are disabled.',
      );
    }

    if (user.status === 'FROZEN') {
      throw new BadRequestException(
        'Account is frozen. Please contact support.',
      );
    }

    if (wallet.status === 'LOCKED' || wallet.status === 'FROZEN') {
      throw new BadRequestException(
        'Wallet is locked. Please contact support.',
      );
    }

    const requestPayload = { amount, beneficiary: beneficiary ?? null };

    try {
      return await this.moneyMovementIdempotency.runInTransaction(
        this.dataSource,
        {
          scope: MoneyMovementScope.WITHDRAW,
          actorUserId: userId,
          idempotencyKey,
          requestPayload,
        },
        async (manager) => {
          const walletAccount = await this.ledgerService.getOrCreateWalletAccount(
            wallet.id,
            manager,
          );

          await manager
            .getRepository(LedgerAccount)
            .createQueryBuilder('la')
            .where('la.id = :id', { id: walletAccount.id })
            .setLock('pessimistic_write')
            .getOne();

          const balance = await this.ledgerService.getBalance(
            walletAccount.id,
            manager,
          );
          if (balance < amount) {
            throw new BadRequestException('Insufficient funds');
          }

          await this.kycPolicyValidation.assertMoneyMovementAllowed({
            manager,
            actorUserId: user.id,
            operation: 'WITHDRAW',
            amountMad: amount,
            ledgerAccountId: walletAccount.id,
            ledgerBalanceMad: balance,
            receiver: null,
          });

          const reference = `WITHDRAW-${Date.now()}`;
          const appTransaction = await manager
            .getRepository(AppTransaction)
            .save({
              sender_user_id: user.id,
              receiver_user_id: null,
              amount: amount,
              type: 'WITHDRAW',
              status: 'PENDING',
              reference,
              idempotency_key: idempotencyKey,
            });

          const emiResponse = await this.emiService.initiateWithdrawal(
            {
              idempotency_key: idempotencyKey,
              user_id: userId,
              wallet_id: wallet.id,
              amount: amount,
              currency: 'MAD',
              beneficiary: beneficiary ?? {
                bank_code: 'INTERNAL',
                account_number: 'INTERNAL',
                account_holder_name: user.full_name ?? 'Unknown',
              },
            },
            manager,
          );

          if (emiResponse.status === EMIOperationStatus.FAILED) {
            throw new BadRequestException(
              emiResponse.error?.message ?? 'Withdrawal failed',
            );
          }

          appTransaction.status = 'COMPLETED';
          if (emiResponse.ledger_transaction_id) {
            appTransaction.ledger_transaction_id =
              emiResponse.ledger_transaction_id;
          }
          await manager.getRepository(AppTransaction).save(appTransaction);

          await this.notificationsService
            .sendToUser(user.id, {
              title: 'Withdrawal completed',
              body: `Ref ${reference}: Withdrawal ${amount.toFixed(2)} MAD completed`,
              reference,
              amount: amount.toFixed(2),
              direction: 'sent',
              event: 'WITHDRAW_COMPLETED',
            })
            .catch(() => {});
          return appTransaction;
        },
      );
    } catch (error) {
      await this.notificationsService
        .sendToUser(user.id, {
          title: 'Withdrawal failed',
          body: `Withdrawal ${amount.toFixed(2)} MAD could not be completed`,
          reference: '',
          amount: amount.toFixed(2),
          direction: 'sent',
          event: 'WITHDRAW_FAILED',
        })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Transfer from driver/courier wallet to their linked consumer wallet
   */
  async transferToConsumerWallet(
    driverCourierUserId: string,
    consumerUserId: string,
    amount: number,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    // Get driver/courier wallet
    const driverWallet = await this.ensureWalletForUserId(driverCourierUserId);
    const driverUser = await this.userRepository.findOne({
      where: { id: driverCourierUserId },
    });
    if (!driverUser) {
      throw new NotFoundException('Driver/Courier user not found');
    }

    // Get or create consumer wallet
    const consumerWallet = await this.ensureWalletForUserId(consumerUserId);
    const consumerUser = await this.userRepository.findOne({
      where: { id: consumerUserId },
    });
    if (!consumerUser) {
      throw new NotFoundException('Consumer user not found');
    }

    // Check driver wallet status
    if (driverWallet.status === 'LOCKED' || driverWallet.status === 'FROZEN') {
      throw new BadRequestException(
        'Driver wallet is locked. Please contact support.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const driverAccount = await this.ledgerService.getOrCreateWalletAccount(
        driverWallet.id,
        manager,
      );
      const consumerAccount = await this.ledgerService.getOrCreateWalletAccount(
        consumerWallet.id,
        manager,
      );

      // Lock driver account for balance check
      await manager
        .getRepository(LedgerAccount)
        .createQueryBuilder('la')
        .where('la.id = :id', { id: driverAccount.id })
        .setLock('pessimistic_write')
        .getOne();

      // Check driver balance
      const balance = await this.ledgerService.getBalance(
        driverAccount.id,
        manager,
      );
      if (balance < amount) {
        throw new BadRequestException('Insufficient funds in driver wallet');
      }

      const reference = `TRANSFER-TO-CONSUMER-${Date.now()}`;

      // Create app transaction record
      const appTransaction = await manager.getRepository(AppTransaction).save({
        sender_user_id: driverCourierUserId,
        receiver_user_id: consumerUserId,
        amount: amount,
        type: 'WALLET_TRANSFER',
        status: 'PENDING',
        reference,
      });

      const ledgerTxn = await this.ledgerPostingService.postTwoLegJournal(
        manager,
        {
          idempotencyKey: `wallet_transfer:${reference}`.slice(0, 128),
          reference,
          description:
            'Transfer from driver/courier wallet to consumer wallet',
          debitAccountId: driverAccount.id,
          creditAccountId: consumerAccount.id,
          amount,
          metadata: {
            app_transaction_id: appTransaction.id,
            kind: 'WALLET_TRANSFER',
          },
        },
      );

      appTransaction.status = 'COMPLETED';
      appTransaction.ledger_transaction_id = ledgerTxn.id;
      await manager.getRepository(AppTransaction).save(appTransaction);

      return {
        success: true,
        amount,
        reference,
        driver_balance: balance - amount,
        consumer_balance: await this.ledgerService.getBalance(
          consumerAccount.id,
          manager,
        ),
      };
    });
  }
}
