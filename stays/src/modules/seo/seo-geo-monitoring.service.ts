import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoGeoRequestLog } from './entities/seo-geo-request-log.entity';
import type { SeoGeoOverview } from './seo.types';

@Injectable()
export class SeoGeoMonitoringService {
  constructor(
    @InjectRepository(SeoGeoRequestLog)
    private readonly logRepo: Repository<SeoGeoRequestLog>,
  ) {}

  async logRequest(args: {
    endpoint: string;
    pageSlug?: string | null;
    locale?: string | null;
    userAgent?: string | null;
    referrer?: string | null;
  }): Promise<void> {
    void this.logRepo
      .save(
        this.logRepo.create({
          endpoint: args.endpoint,
          page_slug: args.pageSlug ?? null,
          locale: args.locale ?? null,
          user_agent: args.userAgent ?? null,
          referrer: args.referrer ?? null,
        }),
      )
      .catch(() => undefined);
  }

  async getOverview(days = 7): Promise<SeoGeoOverview> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const total = await this.logRepo
      .createQueryBuilder('l')
      .where('l.requested_at >= :since', { since })
      .getCount();

    const topDestinations = await this.logRepo
      .createQueryBuilder('l')
      .select('l.page_slug', 'slug')
      .addSelect('COUNT(*)', 'count')
      .where('l.requested_at >= :since', { since })
      .andWhere('l.page_slug IS NOT NULL')
      .groupBy('l.page_slug')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany<{ slug: string; count: string }>();

    const byEndpoint = await this.logRepo
      .createQueryBuilder('l')
      .select('l.endpoint', 'endpoint')
      .addSelect('COUNT(*)', 'count')
      .where('l.requested_at >= :since', { since })
      .groupBy('l.endpoint')
      .getRawMany<{ endpoint: string; count: string }>();

    return {
      periodDays: days,
      totalRequests: total,
      requestsPerWeek: total,
      topDestinations: topDestinations.map((r) => ({
        slug: r.slug,
        count: Number(r.count),
      })),
      byEndpoint: Object.fromEntries(
        byEndpoint.map((r) => [r.endpoint, Number(r.count)]),
      ),
    };
  }
}
