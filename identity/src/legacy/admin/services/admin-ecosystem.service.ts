import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Ride } from '../../go-taxi/entities/ride.entity';
import { Order } from '../../go-delivery/orders/entities/order.entity';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStaysService } from './admin-stays.service';

@Injectable()
export class AdminEcosystemService {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
    private readonly adminStaysService: AdminStaysService,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async getEcosystemStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [payStats, staysStats, ridesToday, completedRidesToday, ordersToday, completedOrdersToday] =
      await Promise.all([
        this.adminDashboardService.getStats(),
        this.adminStaysService.getStats(),
        this.rideRepo.count({
          where: { created_at: MoreThanOrEqual(startOfDay) },
        }),
        this.rideRepo.count({
          where: {
            created_at: MoreThanOrEqual(startOfDay),
            status: 'COMPLETED' as any,
          },
        }),
        this.orderRepo.count({
          where: { created_at: MoreThanOrEqual(startOfDay) },
        }),
        this.orderRepo
          .createQueryBuilder('o')
          .where('o.created_at >= :start', { start: startOfDay })
          .andWhere("o.status = 'DELIVERED'")
          .getCount(),
      ]);

    const goRevenueMtd = await this.rideRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.fare_amount), 0)', 'total')
      .where('r.completed_at >= :start', { start: startOfMonth })
      .andWhere('r.status = :status', { status: 'COMPLETED' })
      .getRawOne();

    return {
      pay: {
        ...payStats,
      },
      go: {
        ridesToday,
        completedRidesToday,
        deliveriesToday: completedOrdersToday,
        activeOrdersToday: ordersToday,
        goRevenueMtd: Number(goRevenueMtd?.total ?? 0),
      },
      stays: {
        activeListings: (staysStats as any)?.liveListings ?? (staysStats as any)?.totalListings ?? 0,
        bookingsMtd: (staysStats as any)?.todayBookings ?? (staysStats as any)?.totalBookings ?? 0,
        hostsPending: (staysStats as any)?.pendingHostVerification ?? 0,
        revenueMtd: (staysStats as any)?.totalRevenue ?? (staysStats as any)?.todayRevenue ?? 0,
      },
      systemStatus: payStats.systemStatus ?? { api: 'healthy', database: 'healthy' },
    };
  }
}
