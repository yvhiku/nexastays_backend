import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Ride } from '../../go-taxi/entities/ride.entity';
import { Order } from '../../go-delivery/orders/entities/order.entity';
import {
  CASABLANCA_PRICING,
  SUPPORTED_RIDE_TYPES,
  type RideCategoryPricing,
} from '../../go-taxi/pricing/config/casablanca-pricing.config';

@Injectable()
export class AdminGoService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async getGoStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      ridesToday,
      completedRidesToday,
      cancelledRidesToday,
      ordersToday,
      deliveredToday,
      goRevenueMtd,
    ] = await Promise.all([
      this.rideRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.rideRepo
        .createQueryBuilder('r')
        .where('r.created_at >= :start', { start: startOfDay })
        .andWhere('r.status = :status', { status: 'COMPLETED' })
        .getCount(),
      this.rideRepo
        .createQueryBuilder('r')
        .where('r.created_at >= :start', { start: startOfDay })
        .andWhere('r.status = :status', { status: 'CANCELLED' })
        .getCount(),
      this.orderRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.orderRepo
        .createQueryBuilder('o')
        .where('o.created_at >= :start', { start: startOfDay })
        .andWhere("o.status = 'DELIVERED'")
        .getCount(),
      this.rideRepo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.fare_amount), 0)', 'total')
        .where('r.completed_at >= :start', { start: startOfMonth })
        .andWhere('r.status = :status', { status: 'COMPLETED' })
        .getRawOne(),
    ]);

    const totalRidesToday = ridesToday;
    const cancellationRate =
      totalRidesToday === 0
        ? 0
        : Number((((cancelledRidesToday || 0) / totalRidesToday) * 100).toFixed(2));

    return {
      ridesToday,
      completedRidesToday,
      cancelledRidesToday,
      deliveriesToday: deliveredToday,
      activeOrdersToday: ordersToday,
      driversOnline: 0,
      couriersOnline: 0,
      cancellationRate,
      goRevenueMtd: Number(goRevenueMtd?.total ?? 0),
    };
  }

  async getRides(params: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.rideRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.rider_user', 'ru')
      .leftJoinAndSelect('r.driver_user', 'du')
      .orderBy('r.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (params.status && params.status !== 'all') {
      qb.andWhere('r.status = :status', { status: params.status });
    }

    const [rides, total] = await qb.getManyAndCount();

    const data = rides.map((r) => ({
      id: r.id,
      rider_user_id: r.rider_user_id,
      passenger_name: (r as any).rider_user?.full_name ?? (r as any).rider_user?.phone_number ?? null,
      driver_user_id: r.driver_user_id,
      driver_name: (r as any).driver_user?.full_name ?? (r as any).driver_user?.phone_number ?? null,
      status: r.status,
      fare_amount: Number(r.fare_amount),
      currency: r.currency,
      ride_type: r.ride_type,
      pickup_location: r.pickup_location,
      dropoff_location: r.dropoff_location,
      created_at: r.created_at,
      completed_at: r.completed_at,
    }));

    return { data, total, page, limit };
  }

  async getDeliveryOrders(params: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.customer', 'customer')
      .leftJoinAndSelect('o.merchant', 'merchant')
      .leftJoinAndSelect('merchant.user', 'mu')
      .leftJoinAndSelect('o.courier', 'courier')
      .orderBy('o.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (params.status && params.status !== 'all') {
      qb.andWhere('o.status = :status', { status: params.status });
    }

    const [orders, total] = await qb.getManyAndCount();

    const data = orders.map((o) => ({
      id: o.id,
      customer_id: o.customer_id,
      customer_name: (o as any).customer?.full_name ?? (o as any).customer?.phone_number ?? null,
      merchant_id: o.merchant_id,
      merchant_name: (o as any).merchant?.name ?? (o as any).merchant?.user?.full_name ?? null,
      courier_id: (o as any).courier_id ?? null,
      status: o.status,
      total_amount: o.total_amount != null ? Number(o.total_amount) : null,
      created_at: o.created_at,
    }));

    return { data, total, page, limit };
  }

  async getMerchants(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const totalRow = await this.orderRepo
      .createQueryBuilder('o')
      .select('COUNT(DISTINCT o.merchant_id)', 'total')
      .where('o.merchant_id IS NOT NULL')
      .getRawOne<{ total: string }>();

    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.merchant', 'merchant')
      .leftJoinAndSelect('merchant.user', 'mu')
      .select('o.merchant_id', 'merchant_id')
      .addSelect('COALESCE(merchant.name, mu.full_name, mu.phone_number, \'Unknown\')', 'merchant_name')
      .addSelect('COUNT(o.id)', 'orders_count')
      .addSelect(
        "SUM(CASE WHEN o.created_at >= date_trunc('day', NOW()) THEN 1 ELSE 0 END)",
        'orders_today',
      )
      .addSelect('MAX(o.created_at)', 'last_order_at')
      .where('o.merchant_id IS NOT NULL')
      .groupBy('o.merchant_id')
      .addGroupBy('merchant.name')
      .addGroupBy('mu.full_name')
      .addGroupBy('mu.phone_number')
      .orderBy('MAX(o.created_at)', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<{
        merchant_id: string;
        merchant_name: string;
        orders_count: string;
        orders_today: string;
        last_order_at: string | null;
      }>();

    return {
      data: rows.map((row) => ({
        merchant_id: row.merchant_id,
        merchant_name: row.merchant_name,
        orders_count: Number(row.orders_count ?? 0),
        orders_today: Number(row.orders_today ?? 0),
        last_order_at: row.last_order_at,
      })),
      total: Number(totalRow?.total ?? 0),
      page,
      limit,
    };
  }

  getPricing(): Record<string, RideCategoryPricing> {
    return { ...CASABLANCA_PRICING };
  }

  getPricingRideTypes(): string[] {
    return [...SUPPORTED_RIDE_TYPES];
  }
}
