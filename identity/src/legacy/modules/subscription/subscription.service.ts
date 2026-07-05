import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import { MoneyMovementIdempotencyService } from '../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';
import { KycPolicyValidationService } from '../compliance/kyc-policy/kyc-policy-validation.service';
import { EntryType } from '../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerPostingService } from '../ledger/ledger-posting.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerSystemAccountType } from '../ledger/ledger-chart.constants';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import {
  getProSubscriptionPriceMad,
  normalizeProBillingPeriod,
  type ProBillingPeriod,
} from './subscription.constants';
import { normalizeSubscriptionTier } from '../subscription-limits/subscription-limits.constants';
import type { PurchaseProSubscriptionDto } from './dto/purchase-pro-subscription.dto';
import { UserProSubscription } from './entities/user-pro-subscription.entity';
import {
  computeNextBillingAt,
  deriveAnchorDay,
  renewalIdempotencySuffix,
} from './subscription-billing.utils';

const PAST_DUE_GRACE_DAYS = 7;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
    private readonly ledgerService: LedgerService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly kycPolicyValidation: KycPolicyValidationService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProSubscription)
    private readonly proSubscriptionRepository: Repository<UserProSubscription>,
  ) {}

  getProPricing() {
    return {
      monthly_mad: getProSubscriptionPriceMad('monthly'),
      yearly_mad: getProSubscriptionPriceMad('yearly'),
      currency: 'MAD',
    };
  }

  async getProStatus(userId: string) {
    const sub = await this.proSubscriptionRepository.findOne({
      where: { user_id: userId },
    });
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'rewards_tier'],
    });
    if (!sub) {
      return {
        active: normalizeSubscriptionTier(user?.rewards_tier) === 'pro',
        billing_period: null,
        next_billing_at: null,
        status: null,
        anchor_day: null,
      };
    }
    return {
      active: sub.status === 'active' || sub.status === 'past_due',
      billing_period: sub.billing_period,
      next_billing_at: sub.next_billing_at.toISOString(),
      status: sub.status,
      anchor_day: sub.anchor_day,
      current_period_start: sub.current_period_start.toISOString(),
    };
  }

  async purchasePro(
    userId: string,
    body: PurchaseProSubscriptionDto,
    idempotencyKey: string,
  ) {
    await this.usersService.ensureMandatoryConsentsAccepted(userId);

    const billingPeriod = normalizeProBillingPeriod(body.billing_period);
    if (!billingPeriod) {
      throw new BadRequestException('billing_period must be monthly or yearly');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const existingSub = await this.proSubscriptionRepository.findOne({
      where: { user_id: userId, status: In(['active', 'past_due']) },
    });
    if (existingSub) {
      throw new BadRequestException({
        code: 'ALREADY_PRO',
        message: 'You already have an active Nexa Pro subscription',
      });
    }

    if (normalizeSubscriptionTier(user.rewards_tier) === 'pro') {
      throw new BadRequestException({
        code: 'ALREADY_PRO',
        message: 'You already have Nexa Pro',
      });
    }

    if (user.status === 'DELETION_PENDING' || user.status === 'FROZEN') {
      throw new BadRequestException('Account cannot purchase a subscription');
    }

    const wallet = await this.walletsService.getWalletByUserId(userId);
    if (wallet.status === 'LOCKED' || wallet.status === 'FROZEN') {
      throw new BadRequestException('Wallet is not available for payments');
    }

    const amount = getProSubscriptionPriceMad(billingPeriod);
    const now = new Date();
    const anchorDay = deriveAnchorDay(now);
    const nextBillingAt = computeNextBillingAt(now, billingPeriod, anchorDay);

    return this.moneyMovementIdempotency.runInTransaction(
      this.dataSource,
      {
        scope: MoneyMovementScope.SUBSCRIPTION_PRO,
        actorUserId: userId,
        idempotencyKey,
        requestPayload: { billing_period: billingPeriod, amount, initial: true },
      },
      async (manager) => {
        const charge = await this.chargeProInManager(manager, {
          user,
          wallet,
          billingPeriod,
          amount,
          idempotencyKey,
          reference: `SUB-PRO-${billingPeriod.toUpperCase()}-${Date.now()}`.slice(
            0,
            64,
          ),
          metadataExtra: { initial_purchase: true },
        });

        await manager.getRepository(User).update(user.id, {
          rewards_tier: 'pro',
        });

        await manager.getRepository(UserProSubscription).save({
          user_id: user.id,
          billing_period: billingPeriod,
          status: 'active',
          anchor_day: anchorDay,
          current_period_start: now,
          next_billing_at: nextBillingAt,
          past_due_since: null,
        });

        this.logger.log(
          `User ${userId} subscribed to Nexa Pro (${billingPeriod}); next billing ${nextBillingAt.toISOString()}`,
        );

        return {
          rewards_tier: 'pro',
          billing_period: billingPeriod,
          amount_mad: amount,
          currency: 'MAD',
          transaction_id: charge.appTransaction.id,
          reference: charge.appTransaction.reference,
          next_billing_at: nextBillingAt.toISOString(),
          anchor_day: anchorDay,
        };
      },
    );
  }

  async processDueRenewals(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  }> {
    const now = new Date();
    const due = await this.proSubscriptionRepository.find({
      where: {
        status: In(['active', 'past_due']),
        next_billing_at: LessThanOrEqual(now),
      },
    });

    let succeeded = 0;
    let failed = 0;
    let cancelled = 0;

    for (const sub of due) {
      const outcome = await this.processSingleRenewal(sub, now);
      if (outcome === 'succeeded') succeeded += 1;
      else if (outcome === 'failed') failed += 1;
      else if (outcome === 'cancelled') cancelled += 1;
    }

    return {
      processed: due.length,
      succeeded,
      failed,
      cancelled,
    };
  }

  private async processSingleRenewal(
    sub: UserProSubscription,
    now: Date,
  ): Promise<'succeeded' | 'failed' | 'cancelled'> {
    if (sub.status === 'past_due' && sub.past_due_since) {
      const graceEnd = new Date(sub.past_due_since);
      graceEnd.setUTCDate(graceEnd.getUTCDate() + PAST_DUE_GRACE_DAYS);
      if (now >= graceEnd) {
        await this.cancelSubscription(sub, 'payment_grace_expired');
        return 'cancelled';
      }
    }

    const user = await this.userRepository.findOne({ where: { id: sub.user_id } });
    if (!user || user.status === 'DELETION_PENDING' || user.status === 'FROZEN') {
      await this.cancelSubscription(sub, 'account_unavailable');
      return 'cancelled';
    }

    let wallet: Wallet;
    try {
      wallet = await this.walletsService.getWalletByUserId(sub.user_id);
    } catch {
      await this.markPastDue(sub, now);
      return 'failed';
    }

    if (wallet.status === 'LOCKED' || wallet.status === 'FROZEN') {
      await this.markPastDue(sub, now);
      return 'failed';
    }

    const billingPeriod = sub.billing_period as ProBillingPeriod;
    const amount = getProSubscriptionPriceMad(billingPeriod);
    const idempotencyKey = `SUB-PRO-RENEW-${sub.id}-${renewalIdempotencySuffix(sub.next_billing_at, billingPeriod)}`;

    try {
      await this.moneyMovementIdempotency.runInTransaction(
        this.dataSource,
        {
          scope: MoneyMovementScope.SUBSCRIPTION_PRO,
          actorUserId: sub.user_id,
          idempotencyKey,
          requestPayload: {
            subscription_id: sub.id,
            billing_period: billingPeriod,
            renewal: true,
            due_at: sub.next_billing_at.toISOString(),
          },
        },
        async (manager) => {
          const charge = await this.chargeProInManager(manager, {
            user,
            wallet,
            billingPeriod,
            amount,
            idempotencyKey,
            reference: `SUB-PRO-RENEW-${billingPeriod.toUpperCase()}-${Date.now()}`.slice(
              0,
              64,
            ),
            metadataExtra: {
              subscription_id: sub.id,
              renewal: true,
            },
          });

          const periodStart = sub.next_billing_at;
          const nextBillingAt = computeNextBillingAt(
            periodStart,
            billingPeriod,
            sub.anchor_day,
          );

          await manager.getRepository(UserProSubscription).update(sub.id, {
            status: 'active',
            past_due_since: null,
            current_period_start: periodStart,
            next_billing_at: nextBillingAt,
          });

          await manager.getRepository(User).update(user.id, {
            rewards_tier: 'pro',
          });

          this.logger.log(
            `Renewed Nexa Pro for user ${sub.user_id} (${amount} MAD); next ${nextBillingAt.toISOString()} tx=${charge.appTransaction.id}`,
          );
        },
      );
      return 'succeeded';
    } catch (err) {
      const code =
        err instanceof BadRequestException
          ? (err.getResponse() as { code?: string })?.code
          : undefined;
      if (code === 'INSUFFICIENT_FUNDS') {
        await this.markPastDue(sub, now);
        return 'failed';
      }
      this.logger.warn(
        `Pro renewal failed for user ${sub.user_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.markPastDue(sub, now);
      return 'failed';
    }
  }

  private async markPastDue(sub: UserProSubscription, now: Date): Promise<void> {
    await this.proSubscriptionRepository.update(sub.id, {
      status: 'past_due',
      past_due_since: sub.past_due_since ?? now,
    });
    this.logger.warn(
      `Nexa Pro past_due for user ${sub.user_id} (anchor day ${sub.anchor_day})`,
    );
  }

  private async cancelSubscription(
    sub: UserProSubscription,
    reason: string,
  ): Promise<void> {
    await this.proSubscriptionRepository.update(sub.id, {
      status: 'cancelled',
    });
    await this.userRepository.update(sub.user_id, {
      rewards_tier: 'standard',
    });
    this.logger.warn(
      `Cancelled Nexa Pro for user ${sub.user_id} (${reason})`,
    );
  }

  private async chargeProInManager(
    manager: EntityManager,
    params: {
      user: User;
      wallet: Wallet;
      billingPeriod: ProBillingPeriod;
      amount: number;
      idempotencyKey: string;
      reference: string;
      metadataExtra?: Record<string, unknown>;
    },
  ): Promise<{ appTransaction: AppTransaction }> {
    const walletAccount = await this.ledgerService.getOrCreateWalletAccount(
      params.wallet.id,
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
    if (balance < params.amount) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient wallet balance',
      });
    }

    await this.kycPolicyValidation.assertMoneyMovementAllowed({
      manager,
      actorUserId: params.user.id,
      operation: 'SUBSCRIPTION_PRO',
      amountMad: params.amount,
      ledgerAccountId: walletAccount.id,
      ledgerBalanceMad: balance,
      receiver: null,
      auditContext: { app_transaction_type: 'SUBSCRIPTION_PRO' },
    });

    const companyRevenueAccount =
      await this.ledgerService.getOrCreateSystemAccount(
        manager,
        LedgerSystemAccountType.COMPANY_REVENUE,
      );

    const ledgerTxn = await this.ledgerPostingService.postJournal(manager, {
      idempotencyKey: params.idempotencyKey,
      reference: params.reference,
      description: `Nexa Pro subscription (${params.billingPeriod})`,
      metadata: {
        billing_period: params.billingPeriod,
        subscription_product: 'nexa_pro',
        user_id: params.user.id,
        ...params.metadataExtra,
      },
      lines: [
        {
          accountId: walletAccount.id,
          entryType: EntryType.DEBIT,
          amount: params.amount,
        },
        {
          accountId: companyRevenueAccount.id,
          entryType: EntryType.CREDIT,
          amount: params.amount,
        },
      ],
    });

    const appTransaction = await manager.getRepository(AppTransaction).save({
      sender_user_id: params.user.id,
      receiver_user_id: null,
      amount: params.amount,
      type: 'SUBSCRIPTION_PRO',
      status: 'COMPLETED',
      reference: params.reference,
      idempotency_key: params.idempotencyKey,
      ledger_transaction_id: ledgerTxn.id,
    });

    return { appTransaction };
  }
}
