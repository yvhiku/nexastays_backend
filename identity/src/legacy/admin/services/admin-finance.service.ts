import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../../ledger/entities/ledger-account.entity';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import { User } from '../../users/entities/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { TransactionFee } from '../../transactions/entities/transaction-fee.entity';
import { Ride } from '../../go-taxi/entities/ride.entity';
import { Order } from '../../go-delivery/orders/entities/order.entity';
import { AdminFinanceCommissionsQueryDto } from '../dto/admin-finance-query.dto';
import { LedgerService } from '../../ledger/ledger.service';

@Injectable()
export class AdminFinanceService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepo: Repository<LedgerEntry>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountRepo: Repository<LedgerAccount>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(AppTransaction)
    private readonly appTxRepo: Repository<AppTransaction>,
    @InjectRepository(TransactionFee)
    private readonly feeRepo: Repository<TransactionFee>,
    private readonly ledgerService: LedgerService,
  ) {}

  /** Sum CREDIT postings on a system ledger account (optional reference filter / date). */
  private async sumSystemAccountCredits(params: {
    accountType: string;
    referenceLike?: string;
    since?: Date;
  }): Promise<number> {
    const account = await this.ledgerAccountRepo.findOne({
      where: { system_account: true, account_type: params.accountType },
      select: ['id'],
    });
    if (!account) return 0;

    const qb = this.ledgerEntryRepo
      .createQueryBuilder('e')
      .innerJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
      .select('COALESCE(SUM(e.amount), 0)', 'total')
      .where('e.account_id = :accountId', { accountId: account.id })
      .andWhere("e.entry_type = 'CREDIT'");

    if (params.referenceLike) {
      qb.andWhere('t.reference LIKE :ref', { ref: params.referenceLike });
    }
    if (params.since) {
      qb.andWhere('e.created_at >= :start', { start: params.since });
    }

    const row = await qb.getRawOne();
    return Number(row?.total ?? 0);
  }

  async getRevenue() {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalRow, dailyRow, monthlyRow] = await Promise.all([
      this.feeRepo
        .createQueryBuilder('f')
        .select('COALESCE(SUM(f.amount), 0)', 'total')
        .getRawOne(),
      this.feeRepo
        .createQueryBuilder('f')
        .select('COALESCE(SUM(f.amount), 0)', 'total')
        .where('f.created_at >= :start', { start: startOfDay })
        .getRawOne(),
      this.feeRepo
        .createQueryBuilder('f')
        .select('COALESCE(SUM(f.amount), 0)', 'total')
        .where('f.created_at >= :start', { start: startOfMonth })
        .getRawOne(),
    ]);

    const total = Number(totalRow?.total ?? 0);
    const daily = Number(dailyRow?.total ?? 0);
    const monthly = Number(monthlyRow?.total ?? 0);

    // Get Go Ride revenue from FEES ledger account
    // New format: RIDE-{rideId}-{timestamp} (metadata in description)
    // Legacy format: RIDE-FEE-{rideId}-{timestamp} (for backward compatibility)
    const systemFees = await this.ledgerAccountRepo.findOne({
      where: { system_account: true, account_type: 'FEES' },
      select: ['id'],
    });
    let goRideRevenue = 0;
    let goDeliveryRevenue = 0;
    if (systemFees) {
      const [rideRevenueRow, deliveryRevenueRow] = await Promise.all([
        this.ledgerEntryRepo
          .createQueryBuilder('e')
          .innerJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
          .select('COALESCE(SUM(e.amount), 0)', 'total')
          .where('e.account_id = :accountId', { accountId: systemFees.id })
          .andWhere("e.entry_type = 'CREDIT'")
          .andWhere(
            "(t.reference LIKE 'RIDE-%' OR t.reference LIKE 'RIDE-FEE-%')",
          )
          .getRawOne(),
        this.ledgerEntryRepo
          .createQueryBuilder('e')
          .innerJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
          .select('COALESCE(SUM(e.amount), 0)', 'total')
          .where('e.account_id = :accountId', { accountId: systemFees.id })
          .andWhere("e.entry_type = 'CREDIT'")
          .andWhere("t.reference LIKE 'DELIVERY_ORDER-%'")
          .getRawOne(),
      ]);
      goRideRevenue = Number(rideRevenueRow?.total ?? 0);
      goDeliveryRevenue = Number(deliveryRevenueRow?.total ?? 0);
    }

    // Nexa Pro subscriptions → COMPANY_REVENUE (legacy purchases may still be on FEES).
    const [
      subscriptionRevenue,
      subscriptionRevenueDaily,
      subscriptionRevenueMonthly,
      subscriptionRevenueLegacyFees,
      subscriptionLegacyDaily,
      subscriptionLegacyMonthly,
    ] = await Promise.all([
      this.sumSystemAccountCredits({
        accountType: 'COMPANY_REVENUE',
        referenceLike: 'SUB-PRO-%',
      }),
      this.sumSystemAccountCredits({
        accountType: 'COMPANY_REVENUE',
        referenceLike: 'SUB-PRO-%',
        since: startOfDay,
      }),
      this.sumSystemAccountCredits({
        accountType: 'COMPANY_REVENUE',
        referenceLike: 'SUB-PRO-%',
        since: startOfMonth,
      }),
      this.sumSystemAccountCredits({
        accountType: 'FEES',
        referenceLike: 'SUB-PRO-%',
      }),
      this.sumSystemAccountCredits({
        accountType: 'FEES',
        referenceLike: 'SUB-PRO-%',
        since: startOfDay,
      }),
      this.sumSystemAccountCredits({
        accountType: 'FEES',
        referenceLike: 'SUB-PRO-%',
        since: startOfMonth,
      }),
    ]);

    const subscriptionRevenueTotal =
      subscriptionRevenue + subscriptionRevenueLegacyFees;
    const subscriptionRevenueDailyTotal =
      subscriptionRevenueDaily + subscriptionLegacyDaily;
    const subscriptionRevenueMonthlyTotal =
      subscriptionRevenueMonthly + subscriptionLegacyMonthly;
    const platformTotal =
      total +
      goRideRevenue +
      goDeliveryRevenue +
      subscriptionRevenueTotal;

    return {
      total: platformTotal,
      payRevenue: total,
      goRideRevenue,
      goDeliveryRevenue,
      subscriptionRevenue: subscriptionRevenueTotal,
      subscriptionRevenueCompanyAccount: subscriptionRevenue,
      subscriptionRevenueLegacyFeesAccount: subscriptionRevenueLegacyFees,
      total_revenue: platformTotal,
      daily_revenue: daily + subscriptionRevenueDailyTotal,
      monthly_revenue: monthly + subscriptionRevenueMonthlyTotal,
    };
  }

  async getCommissions(query: AdminFinanceCommissionsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;
    const fetchSize = limit * page;

    const payRows = await this.feeRepo
      .createQueryBuilder('f')
      .innerJoin(AppTransaction, 't', 't.id = f.app_transaction_id')
      .select([
        'f.id as id',
        'f.app_transaction_id as transaction_id',
        't.amount as amount',
        'f.amount as commission_amount',
        'f.created_at as created_at',
      ])
      .orderBy('f.created_at', 'DESC')
      .take(fetchSize)
      .getRawMany();

    const totalCommissions = await this.feeRepo
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.amount), 0)', 'total')
      .getRawOne();
    const nexapay = Number(totalCommissions?.total ?? 0);

    const goRows = await this.getGoRideCommissionRows(fetchSize);
    const goCommissions = await this.mapGoRideCommissions(goRows);
    const nexago = goCommissions.reduce(
      (sum, r) => sum + Number(r.commission_amount ?? 0),
      0,
    );

    const deliveryRows = await this.getDeliveryOrderCommissionRows(fetchSize);
    const deliveryCommissions =
      await this.mapDeliveryOrderCommissions(deliveryRows);
    const nexagoDelivery = deliveryCommissions.reduce(
      (sum, r) => sum + Number(r.commission_amount ?? 0),
      0,
    );

    const payCommissions = payRows.map((r) => ({
      id: r.id,
      service: 'pay',
      transaction_id: r.transaction_id,
      amount: Number(r.amount ?? 0),
      rate: 0.05,
      commission_amount: Number(r.commission_amount ?? 0),
      created_at: r.created_at,
    }));

    const commissions = [
      ...payCommissions,
      ...goCommissions,
      ...deliveryCommissions,
    ]
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      })
      .slice(skip, skip + limit);

    return {
      commissions,
      summary: {
        total_commissions: nexapay + nexago + nexagoDelivery,
        nexapay_commissions: nexapay,
        nexago_commissions: nexago,
        nexago_delivery_commissions: nexagoDelivery,
      },
    };
  }

  private async getGoRideCommissionRows(limit: number) {
    const systemFees = await this.ledgerAccountRepo.findOne({
      where: { system_account: true, account_type: 'FEES' },
      select: ['id'],
    });
    if (!systemFees) return [];

    return this.ledgerEntryRepo
      .createQueryBuilder('e')
      .innerJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
      .select([
        'e.id as id',
        'e.transaction_id as transaction_id',
        'e.amount as commission_amount',
        'e.created_at as created_at',
        't.reference as reference',
        't.description as metadata',
      ])
      .where('e.account_id = :accountId', { accountId: systemFees.id })
      .andWhere("e.entry_type = 'CREDIT'")
      .andWhere("(t.reference LIKE 'RIDE-%' OR t.reference LIKE 'RIDE-FEE-%')")
      .orderBy('e.created_at', 'DESC')
      .take(limit)
      .getRawMany();
  }

  private async mapGoRideCommissions(rows: any[]) {
    // Parse metadata from description field (JSON) or extract from reference
    const rideIds: string[] = [];
    const metadataMap = new Map<string, any>();

    for (const row of rows) {
      const ref = String(row.reference ?? '');
      let rideId: string | null = null;
      let metadata: any = null;

      // Try to parse JSON metadata from description
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
          if (metadata.ride_id) {
            rideId = metadata.ride_id;
            if (rideId) {
              metadataMap.set(rideId, metadata);
            }
          }
        } catch (e) {
          // Not JSON, fall back to reference parsing
        }
      }

      // Fall back to parsing reference (legacy format: RIDE-FEE-{id}-{timestamp} or new: RIDE-{id}-{timestamp})
      if (!rideId) {
        const match = ref.match(/^RIDE(?:-FEE)?-(.+?)(?:-\d+)?$/);
        rideId = match?.[1] ?? null;
      }

      if (rideId) {
        rideIds.push(rideId);
      }
    }

    const rides = rideIds.length
      ? await this.rideRepo.find({ where: { id: In(rideIds) } })
      : [];
    const rideById = new Map(rides.map((ride) => [ride.id, ride]));

    return rows.map((row) => {
      const ref = String(row.reference ?? '');
      let rideId: string | null = null;
      let metadata: any = null;

      // Try to parse JSON metadata
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
          if (metadata.ride_id) {
            rideId = metadata.ride_id;
          }
        } catch (e) {
          // Not JSON
        }
      }

      // Fall back to reference parsing
      if (!rideId) {
        const match = ref.match(/^RIDE(?:-FEE)?-(.+?)(?:-\d+)?$/);
        rideId = match?.[1] ?? null;
      }

      const ride = rideId ? rideById.get(rideId) : null;
      const fareAmount =
        metadata?.fare ?? (ride ? Number(ride.fare_amount ?? 0) : 0);
      const commissionAmount = Number(row.commission_amount ?? 0);
      const commissionRate =
        metadata?.commission_rate ??
        (fareAmount > 0 ? commissionAmount / fareAmount : 0);
      const driverEarnings =
        metadata?.driver_earnings ?? fareAmount - commissionAmount;

      return {
        id: row.id,
        service: 'go',
        service_type: metadata?.service ?? 'GO_RIDE',
        transaction_id: rideId ?? row.transaction_id,
        amount: fareAmount,
        rate: commissionRate,
        commission_amount: commissionAmount,
        driver_earnings: driverEarnings,
        fare_breakdown: metadata
          ? {
              fare: metadata.fare,
              commission_rate: metadata.commission_rate,
              commission_amount: metadata.commission_amount,
              driver_earnings: metadata.driver_earnings,
            }
          : null,
        created_at: row.created_at,
      };
    });
  }

  private async getDeliveryOrderCommissionRows(limit: number) {
    const systemFees = await this.ledgerAccountRepo.findOne({
      where: { system_account: true, account_type: 'FEES' },
      select: ['id'],
    });
    if (!systemFees) return [];

    return this.ledgerEntryRepo
      .createQueryBuilder('e')
      .innerJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
      .select([
        'e.id as id',
        'e.transaction_id as transaction_id',
        'e.amount as commission_amount',
        'e.created_at as created_at',
        't.reference as reference',
        't.description as metadata',
      ])
      .where('e.account_id = :accountId', { accountId: systemFees.id })
      .andWhere("e.entry_type = 'CREDIT'")
      .andWhere("t.reference LIKE 'DELIVERY_ORDER-%'")
      .orderBy('e.created_at', 'DESC')
      .take(limit)
      .getRawMany();
  }

  private async mapDeliveryOrderCommissions(rows: any[]) {
    // Parse metadata from description field (JSON) or extract from reference
    const orderIds: string[] = [];

    for (const row of rows) {
      const ref = String(row.reference ?? '');
      let orderId: string | null = null;

      // Try to parse JSON metadata from description
      if (row.metadata) {
        try {
          const metadata = JSON.parse(row.metadata);
          if (metadata.order_id) {
            orderId = metadata.order_id;
          }
        } catch (e) {
          // Not JSON, fall back to reference parsing
        }
      }

      // Fall back to parsing reference
      if (!orderId) {
        const match = ref.match(/^DELIVERY_ORDER_(.+)$/);
        orderId = match?.[1] ?? null;
      }

      if (orderId) {
        orderIds.push(orderId);
      }
    }

    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) } })
      : [];
    const orderById = new Map(orders.map((order) => [order.id, order]));

    return rows.map((row) => {
      const ref = String(row.reference ?? '');
      let orderId: string | null = null;
      let metadata: any = null;

      // Try to parse JSON metadata
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
          if (metadata.order_id) {
            orderId = metadata.order_id;
          }
        } catch (e) {
          // Not JSON
        }
      }

      // Fall back to reference parsing
      if (!orderId) {
        const match = ref.match(/^DELIVERY_ORDER_(.+)$/);
        orderId = match?.[1] ?? null;
      }

      const order = orderId ? orderById.get(orderId) : null;
      const totalAmount =
        metadata?.total_amount ?? (order ? Number(order.total_amount ?? 0) : 0);
      const commissionAmount = Number(row.commission_amount ?? 0);
      const merchantCommissionRate =
        metadata?.merchant_commission_rate ??
        (order && order.subtotal > 0 ? commissionAmount / order.subtotal : 0);

      return {
        id: row.id,
        service: 'go-delivery',
        service_type: metadata?.service ?? 'GO_DELIVERY',
        transaction_id: orderId ?? row.transaction_id,
        amount: totalAmount,
        rate: merchantCommissionRate,
        commission_amount: commissionAmount,
        fare_breakdown: metadata
          ? {
              subtotal: metadata.subtotal,
              delivery_fee: metadata.delivery_fee,
              total_amount: metadata.total_amount,
              merchant_commission_rate: metadata.merchant_commission_rate,
              merchant_commission: metadata.merchant_commission,
              merchant_payout: metadata.merchant_payout,
              courier_payout: metadata.courier_payout,
              platform_revenue: metadata.platform_revenue,
            }
          : null,
        created_at: row.created_at,
      };
    });
  }

  async getDriverPayouts() {
    // Get both drivers and couriers
    const drivers = await this.userRepo.find({
      where: { account_type: 'DRIVER' },
      select: ['id', 'full_name', 'phone_number'],
    });

    // Get couriers - users who have completed orders as couriers
    // For MVP, we'll check users who have courier_id in orders
    const courierIds = await this.orderRepo
      .createQueryBuilder('o')
      .select('DISTINCT o.courier_id', 'courier_id')
      .where('o.courier_id IS NOT NULL')
      .getRawMany();

    const courierUserIds = courierIds
      .map((row) => row.courier_id)
      .filter(Boolean);
    const couriers = courierUserIds.length
      ? await this.userRepo.find({
          where: { id: In(courierUserIds) },
          select: ['id', 'full_name', 'phone_number'],
        })
      : [];

    const payouts: Array<{
      id: string;
      driver_id: string;
      driver_name: string;
      amount: number;
      status: string;
      period: string;
      processed_at: string | null;
      total_earned?: number;
      total_paid?: number;
      pending_balance?: number;
    }> = [];

    for (const d of drivers) {
      const wallet = await this.walletRepo.findOne({
        where: { user_id: d.id },
      });
      if (!wallet) {
        payouts.push({
          id: d.id,
          driver_id: d.id,
          driver_name: d.full_name || d.phone_number || 'Unknown',
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          processed_at: null,
          total_earned: 0,
          total_paid: 0,
          pending_balance: 0,
        });
        continue;
      }

      const account = await this.ledgerAccountRepo.findOne({
        where: { wallet_id: wallet.id },
        select: ['id'],
      });
      if (!account) {
        payouts.push({
          id: d.id,
          driver_id: d.id,
          driver_name: d.full_name || d.phone_number || 'Unknown',
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          processed_at: null,
          total_earned: 0,
          total_paid: 0,
          pending_balance: 0,
        });
        continue;
      }

      const balance = await this.ledgerService.getBalance(account.id);
      const credits = await this.ledgerEntryRepo
        .createQueryBuilder('e')
        .select(
          "COALESCE(SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE 0 END), 0)",
          't',
        )
        .where('e.account_id = :aid', { aid: account.id })
        .getRawOne();
      const debits = await this.ledgerEntryRepo
        .createQueryBuilder('e')
        .select(
          "COALESCE(SUM(CASE WHEN e.entry_type = 'DEBIT' THEN e.amount ELSE 0 END), 0)",
          't',
        )
        .where('e.account_id = :aid', { aid: account.id })
        .getRawOne();
      const totalEarned = Number(credits?.t ?? 0);
      const totalPaid = Number(debits?.t ?? 0);
      const pending = Number(balance ?? 0);

      payouts.push({
        id: d.id,
        driver_id: d.id,
        driver_name: d.full_name || d.phone_number || 'Unknown',
        amount: pending,
        status: pending > 0 ? 'PENDING' : 'COMPLETED',
        period: 'N/A',
        processed_at: null,
        total_earned: totalEarned,
        total_paid: totalPaid,
        pending_balance: pending,
      });
    }

    // Add couriers to payouts
    for (const c of couriers) {
      // Skip if already added as driver
      if (drivers.some((d) => d.id === c.id)) continue;

      const wallet = await this.walletRepo.findOne({
        where: { user_id: c.id },
      });
      if (!wallet) {
        payouts.push({
          id: c.id,
          driver_id: c.id,
          driver_name: `${c.full_name || c.phone_number || 'Unknown'} (Courier)`,
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          processed_at: null,
          total_earned: 0,
          total_paid: 0,
          pending_balance: 0,
        });
        continue;
      }

      const account = await this.ledgerAccountRepo.findOne({
        where: { wallet_id: wallet.id },
        select: ['id'],
      });
      if (!account) {
        payouts.push({
          id: c.id,
          driver_id: c.id,
          driver_name: `${c.full_name || c.phone_number || 'Unknown'} (Courier)`,
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          processed_at: null,
          total_earned: 0,
          total_paid: 0,
          pending_balance: 0,
        });
        continue;
      }

      const balance = await this.ledgerService.getBalance(account.id);
      const credits = await this.ledgerEntryRepo
        .createQueryBuilder('e')
        .select(
          "COALESCE(SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE 0 END), 0)",
          't',
        )
        .where('e.account_id = :aid', { aid: account.id })
        .getRawOne();
      const debits = await this.ledgerEntryRepo
        .createQueryBuilder('e')
        .select(
          "COALESCE(SUM(CASE WHEN e.entry_type = 'DEBIT' THEN e.amount ELSE 0 END), 0)",
          't',
        )
        .where('e.account_id = :aid', { aid: account.id })
        .getRawOne();
      const totalEarned = Number(credits?.t ?? 0);
      const totalPaid = Number(debits?.t ?? 0);
      const pending = Number(balance ?? 0);

      payouts.push({
        id: c.id,
        driver_id: c.id,
        driver_name: `${c.full_name || c.phone_number || 'Unknown'} (Courier)`,
        amount: pending,
        status: pending > 0 ? 'PENDING' : 'COMPLETED',
        period: 'N/A',
        processed_at: null,
        total_earned: totalEarned,
        total_paid: totalPaid,
        pending_balance: pending,
      });
    }

    return payouts;
  }

  /** Merchant display: uses User.full_name today; consider go_delivery.merchant.name when evolving to business entities. */
  async getMerchantSettlements() {
    const merchants = await this.userRepo.find({
      where: { account_type: 'MERCHANT' },
      select: ['id', 'full_name', 'phone_number'],
    });

    const settlements: Array<{
      id: string;
      merchant_id: string;
      merchant_name: string;
      amount: number;
      status: string;
      period: string;
      settled_at: string | null;
      total_received?: number;
      platform_fees?: number;
      net_amount?: number;
    }> = [];

    for (const m of merchants) {
      const wallet = await this.walletRepo.findOne({
        where: { user_id: m.id },
      });
      if (!wallet) {
        settlements.push({
          id: m.id,
          merchant_id: m.id,
          merchant_name: m.full_name || m.phone_number || 'Unknown',
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          settled_at: null,
          total_received: 0,
          platform_fees: 0,
          net_amount: 0,
        });
        continue;
      }

      const account = await this.ledgerAccountRepo.findOne({
        where: { wallet_id: wallet.id },
        select: ['id'],
      });
      if (!account) {
        settlements.push({
          id: m.id,
          merchant_id: m.id,
          merchant_name: m.full_name || m.phone_number || 'Unknown',
          amount: 0,
          status: 'PENDING',
          period: 'N/A',
          settled_at: null,
          total_received: 0,
          platform_fees: 0,
          net_amount: 0,
        });
        continue;
      }

      const balance = await this.ledgerService.getBalance(account.id);
      const credits = await this.ledgerEntryRepo
        .createQueryBuilder('e')
        .select(
          "COALESCE(SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE 0 END), 0)",
          't',
        )
        .where('e.account_id = :aid', { aid: account.id })
        .getRawOne();
      const totalReceived = Number(credits?.t ?? 0);
      const netAmount = Number(balance ?? 0);
      const platformFees = 0;

      settlements.push({
        id: m.id,
        merchant_id: m.id,
        merchant_name: m.full_name || m.phone_number || 'Unknown',
        amount: netAmount,
        status: netAmount > 0 ? 'PENDING' : 'SETTLED',
        period: 'N/A',
        settled_at: null,
        total_received: totalReceived,
        platform_fees: platformFees,
        net_amount: netAmount,
      });
    }

    return settlements;
  }

  async getSettlementsSummary() {
    const [driverPayouts, merchantSettlements] = await Promise.all([
      this.getDriverPayouts(),
      this.getMerchantSettlements(),
    ]);
    const pendingPayoutsAmount =
      (driverPayouts as Array<{ pending_balance?: number }>).reduce(
        (s, p) => s + Number(p.pending_balance ?? 0),
        0,
      ) +
      (merchantSettlements as Array<{ amount?: number; status?: string }>).reduce(
        (s, m) => s + (m.status === 'PENDING' ? Number(m.amount ?? 0) : 0),
        0,
      );
    const settledThisWeekAmount = 0;
    const recipientsCount =
      (driverPayouts as Array<{ pending_balance?: number }>).filter(
        (p) => Number(p.pending_balance ?? 0) > 0,
      ).length +
      (merchantSettlements as Array<{ amount?: number; status?: string }>).filter(
        (m) => m.status === 'PENDING' && Number(m.amount ?? 0) > 0,
      ).length;
    const nextBatch = new Date();
    nextBatch.setDate(nextBatch.getDate() + ((1 + 7 - nextBatch.getDay()) % 7) || 7);
    nextBatch.setHours(0, 0, 0, 0);
    return {
      pendingPayoutsAmount,
      settledThisWeekAmount,
      recipientsCount,
      nextBatchDate: nextBatch.toISOString().slice(0, 10),
    };
  }
}
