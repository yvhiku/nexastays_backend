import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StaysListing } from '../../stays/entities/stays-listing.entity';
import { StaysBooking } from '../../stays/entities/stays-booking.entity';
import { StaysHostProfile } from '../../stays/entities/stays-host-profile.entity';
import { StaysAuditLog } from '../../stays/entities/stays-audit-log.entity';
import { HostOnboardingService } from '../../stays/hosts/host-onboarding.service';

@Injectable()
export class AdminStaysService {
  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
    private readonly hostOnboarding: HostOnboardingService,
  ) {}

  async getStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalListings,
      liveListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
    ] = await Promise.all([
      this.listingRepo.count(),
      this.listingRepo.count({ where: { status: 'LIVE' } }),
      this.hostProfileRepo.count(),
      this.hostProfileRepo.count({ where: { application_status: 'PENDING' } }),
      this.hostProfileRepo.count({ where: { application_status: 'APPROVED' } }),
      this.bookingRepo.count(),
      this.bookingRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.bookingRepo.count({
        where: { status: 'CONFIRMED' },
      }),
    ]);

    // Platform revenue = guest_fee + host_fee (4% total: 2% guest + 2% host)
    const revenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select(
        'COALESCE(SUM(b.guest_fee + b.host_fee), 0)',
        'total',
      )
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .getRawOne();

    const todayRevenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select(
        'COALESCE(SUM(b.guest_fee + b.host_fee), 0)',
        'total',
      )
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .andWhere(
        '(b.paid_at >= :start OR (b.paid_at IS NULL AND b.created_at >= :start))',
        { start: startOfDay.toISOString() },
      )
      .getRawOne();

    const totalBookingValueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.total_paid), 0)', 'total')
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .getRawOne();

    return {
      totalListings,
      liveListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
      totalRevenue: Number(revenueRow?.total || 0),
      todayRevenue: Number(todayRevenueRow?.total || 0),
      totalBookingValue: Number(totalBookingValueRow?.total || 0),
    };
  }

  async getListings(params?: { status?: string; limit?: number; offset?: number }) {
    const { status, limit = 50, offset = 0 } = params || {};
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.host', 'host')
      .orderBy('l.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('l.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getListing(id: string) {
    return this.listingRepo.findOne({
      where: { id },
      relations: ['host', 'rules', 'rate_plan', 'check_in_contact', 'media'],
    });
  }

  private static readonly LISTING_UPLOAD_DIR = 'uploads/host';
  private static readonly PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

  async getListingMediaPath(listingId: string, assetId: string): Promise<string> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: ['media'],
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const media = listing.media?.find((m) => m.asset_id === assetId);
    if (!media) throw new NotFoundException('Media not found');
    const dir = path.resolve(
      process.cwd(),
      AdminStaysService.LISTING_UPLOAD_DIR,
      listing.host_user_id,
      'listing',
    );
    if (media.kind === 'WALKTHROUGH') {
      const p = path.join(dir, `walkthrough_${assetId}.mp4`);
      try {
        await fs.access(p);
        return p;
      } catch {
        throw new NotFoundException('Walkthrough file not found');
      }
    }
    for (const ext of AdminStaysService.PHOTO_EXTS) {
      const p = path.join(dir, `photo_${assetId}${ext}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        // try next ext
      }
    }
    throw new NotFoundException('Photo file not found');
  }

  async getHosts(params?: {
    status?: string;
    application_status?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.hostOnboarding.listForAdmin({
      application_status: params?.application_status ?? params?.status,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async getBookings(params?: { status?: string; limit?: number; offset?: number }) {
    const { status, limit = 50, offset = 0 } = params || {};
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.listing', 'listing')
      .leftJoinAndSelect('b.guest', 'guest')
      .orderBy('b.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('b.status = :status', { status });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getBooking(id: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['listing', 'guest', 'listing.host', 'occupants'],
    });
    if (!booking) return null;
    // Return occupants with full_name and id_number only (no ID document assets)
    const b = booking as StaysBooking & { occupants?: Array<{ full_name: string; id_number: string | null; is_primary: boolean }> };
    return {
      ...booking,
      occupants: b.occupants?.map((o) => ({ full_name: o.full_name, id_number: o.id_number ?? null, is_primary: o.is_primary })) ?? [],
    };
  }

  async approveHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    return this.hostOnboarding.approve(hostProfileId, adminUserId, auditContext);
  }

  async rejectHost(
    hostProfileId: string,
    reason: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    return this.hostOnboarding.reject(
      hostProfileId,
      reason,
      adminUserId,
      auditContext,
    );
  }

  async freezeHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.hostProfileRepo.findOne({
      where: { id: hostProfileId },
    });
    if (!profile) throw new NotFoundException('Host profile not found');
    if (profile.host_verification_status !== 'APPROVED') {
      throw new BadRequestException('Only approved hosts can be frozen');
    }
    profile.listing_frozen = true;
    await this.hostProfileRepo.save(profile);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: hostProfileId,
        action: 'HOST_LISTING_FROZEN',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return { listing_frozen: true, message: 'Host listing access frozen. They can still book.' };
  }

  async unfreezeHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.hostProfileRepo.findOne({
      where: { id: hostProfileId },
    });
    if (!profile) throw new NotFoundException('Host profile not found');
    profile.listing_frozen = false;
    await this.hostProfileRepo.save(profile);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: hostProfileId,
        action: 'HOST_LISTING_UNFROZEN',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return { listing_frozen: false, message: 'Host can list again.' };
  }

  async approveListing(
    listingId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED listings can be approved');
    }

    listing.status = 'APPROVED';
    await this.listingRepo.save(listing);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_APPROVED',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );

    return { status: 'APPROVED', message: 'Listing approved' };
  }

  async rejectListing(
    listingId: string,
    reason: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED listings can be rejected');
    }

    listing.status = 'REJECTED';
    await this.listingRepo.save(listing);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_REJECTED',
        metadata: { reason },
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );

    return { status: 'REJECTED', message: 'Listing rejected' };
  }

  async setListingLive(
    listingId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'APPROVED') {
      throw new BadRequestException('Only APPROVED listings can be set LIVE');
    }

    listing.status = 'LIVE';
    await this.listingRepo.save(listing);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_SET_LIVE',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );

    return { status: 'LIVE', message: 'Listing is now live' };
  }

  async checkHealth(): Promise<{ status: string; db: string }> {
    try {
      await this.listingRepo.query('SELECT 1');
      return { status: 'ok', db: 'connected' };
    } catch {
      return { status: 'degraded', db: 'disconnected' };
    }
  }
}
