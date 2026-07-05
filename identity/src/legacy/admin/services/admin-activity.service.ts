import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { Ride } from '../../go-taxi/entities/ride.entity';
import { Order } from '../../go-delivery/orders/entities/order.entity';
export interface ActivityEvent {
  id: string;
  type: string;
  product: string;
  payload: Record<string, unknown>;
  created_at: string;
}

@Injectable()
export class AdminActivityService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async getRecentEvents(params: { limit?: number; since?: string }) {
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const since = params.since ? new Date(params.since) : null;

    const [auditLogs, recentRides, recentOrders] = await Promise.all([
      this.auditRepo.find({
        where: since ? { created_at: MoreThanOrEqual(since) } : undefined,
        order: { created_at: 'DESC' },
        take: limit,
      }),
      this.rideRepo.find({
        where: since ? { created_at: MoreThanOrEqual(since) } : undefined,
        order: { created_at: 'DESC' },
        take: Math.ceil(limit / 3),
        relations: ['rider_user', 'driver_user'],
      }),
      this.orderRepo.find({
        where: since ? { created_at: MoreThanOrEqual(since) } : undefined,
        order: { created_at: 'DESC' },
        take: Math.ceil(limit / 3),
        relations: ['customer', 'merchant'],
      }),
    ]);

    const events: ActivityEvent[] = [];

    for (const log of auditLogs) {
      const product = this.inferProduct(log.action, log.entity_type);
      events.push({
        id: log.id,
        type: this.mapAuditActionToEventType(log.action),
        product,
        payload: {
          action: log.action,
          entity_type: log.entity_type,
          entity_id: log.entity_id,
          user_id: log.user_id,
          ...(log.metadata || {}),
        },
        created_at: log.created_at.toISOString(),
      });
    }

    for (const r of recentRides) {
      const ride = r as Ride & { rider_user?: { full_name?: string }; driver_user?: { full_name?: string } | null };
      events.push({
        id: `ride-${r.id}`,
        type: r.status === 'COMPLETED' ? 'ride_completed' : 'ride_created',
        product: 'go',
        payload: {
          rideId: r.id,
          status: r.status,
          amount: Number(r.fare_amount),
          from: r.pickup_location ?? null,
          to: r.dropoff_location ?? null,
          passenger: ride.rider_user?.full_name ?? null,
        },
        created_at: r.created_at.toISOString(),
      });
    }

    for (const o of recentOrders) {
      const order = o as Order & { customer?: { full_name?: string }; merchant?: { name?: string } };
      events.push({
        id: `order-${o.id}`,
        type: o.status === 'DELIVERED' ? 'delivery_delivered' : 'order_created',
        product: 'go',
        payload: {
          orderId: o.id,
          status: o.status,
          total_amount: o.total_amount != null ? Number(o.total_amount) : null,
          customer: order.customer?.full_name ?? null,
          merchant: order.merchant?.name ?? null,
        },
        created_at: o.created_at.toISOString(),
      });
    }

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { events: events.slice(0, limit) };
  }

  private inferProduct(action: string, entityType?: string | null): string {
    if (entityType?.toLowerCase().includes('kyc') || action.toLowerCase().includes('kyc')) return 'pay';
    if (entityType?.toLowerCase().includes('ride') || action.toLowerCase().includes('ride')) return 'go';
    if (entityType?.toLowerCase().includes('order') || action.toLowerCase().includes('order')) return 'go';
    if (entityType?.toLowerCase().includes('booking') || entityType?.toLowerCase().includes('stays')) return 'stays';
    if (action.toLowerCase().includes('fraud') || action.toLowerCase().includes('risk')) return 'pay';
    return 'pay';
  }

  private mapAuditActionToEventType(action: string): string {
    const a = action.toLowerCase();
    if (a.includes('kyc') && (a.includes('approve') || a.includes('verified'))) return 'kyc_approved';
    if (a.includes('kyc') && a.includes('reject')) return 'kyc_rejected';
    if (a.includes('booking') && a.includes('confirm')) return 'booking_confirmed';
    if (a.includes('fraud') || a.includes('risk')) return 'fraud_alert';
    return 'audit';
  }
}
