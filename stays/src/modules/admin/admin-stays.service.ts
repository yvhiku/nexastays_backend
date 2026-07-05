import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysAuditLog } from '../stays/entities/stays-audit-log.entity';
import { StaysListingReview } from '../stays/entities/stays-listing-review.entity';
import { HostOnboardingService } from '../stays/hosts/host-onboarding.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { StaysService } from '../stays/stays.service';
import { StaysBookingOccupant } from '../stays/entities/stays-booking-occupant.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';

@Injectable()
export class AdminStaysService {
  private static readonly LISTING_UPLOAD_DIR = 'uploads/host';
  private static readonly PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
    @InjectRepository(StaysListingReview)
    private readonly reviewRepo: Repository<StaysListingReview>,
    private readonly hostOnboarding: HostOnboardingService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly staysService: StaysService,
    @InjectRepository(StaysBookingOccupant)
    private readonly occupantRepo: Repository<StaysBookingOccupant>,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async getStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalListings,
      liveListings,
      pendingListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
    ] = await Promise.all([
      this.listingRepo.count(),
      this.listingRepo.count({ where: { status: 'LIVE' } }),
      this.listingRepo.count({ where: { status: 'SUBMITTED' } }),
      this.hostProfileRepo.count(),
      this.hostProfileRepo.count({ where: { application_status: 'PENDING' } }),
      this.hostProfileRepo.count({ where: { application_status: 'APPROVED' } }),
      this.bookingRepo.count(),
      this.bookingRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.bookingRepo.count({ where: { status: 'CONFIRMED' } }),
    ]);

    const revenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .getRawOne();

    const todayRevenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
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

    const fees = this.platformSettings.getFeeRates();

    return {
      totalListings,
      liveListings,
      pendingListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
      totalRevenue: Number(revenueRow?.total || 0),
      todayRevenue: Number(todayRevenueRow?.total || 0),
      totalBookingValue: Number(totalBookingValueRow?.total || 0),
      guest_fee_pct: fees.guest_fee_pct,
      host_fee_pct: fees.host_fee_pct,
      guest_fee_percent: fees.guest_fee_percent,
      host_fee_percent: fees.host_fee_percent,
      total_commission_percent: fees.total_commission_percent,
    };
  }

  async getListings(params?: { status?: string; limit?: number; offset?: number }) {
    const { status, limit = 50, offset = 0 } = params || {};
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.rate_plan', 'rate_plan')
      .leftJoinAndSelect('l.media', 'media')
      .orderBy('l.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('l.status = :status', { status: status.toUpperCase() });
    }

    const [items, total] = await qb.getManyAndCount();
    const hostIds = [...new Set(items.map((i) => i.host_user_id))];
    const hosts =
      hostIds.length > 0
        ? await this.hostProfileRepo.find({ where: { user_id: In(hostIds) } })
        : [];
    const hostByUserId = new Map(hosts.map((h) => [h.user_id, h]));

    return {
      items: items.map((l) => ({
        ...l,
        host_profile: hostByUserId.get(l.host_user_id) ?? null,
      })),
      total,
    };
  }

  async getListing(id: string) {
    const listing = await this.listingRepo.findOne({
      where: { id },
      relations: ['rules', 'rate_plan', 'check_in_contact', 'media'],
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const host_profile = await this.hostProfileRepo.findOne({
      where: { user_id: listing.host_user_id },
    });
    return { ...listing, host_profile };
  }

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
        // try next
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
      .orderBy('b.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('b.status = :status', { status: status.toUpperCase() });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getBooking(id: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['listing', 'occupants'],
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return {
      ...booking,
      occupants:
        booking.occupants?.map((o) => ({
          id: o.id,
          full_name: o.full_name,
          id_number: o.id_number ?? null,
          is_primary: o.is_primary,
          phone: o.phone ?? null,
          email: o.email ?? null,
          gender: o.gender ?? null,
          id_document_front_asset_id: o.id_document_front_asset_id ?? null,
          id_document_back_asset_id: o.id_document_back_asset_id ?? null,
          created_at: o.created_at,
        })) ?? [],
    };
  }

  async getOccupantIdDocumentPath(
    bookingId: string,
    occupantId: string,
    side: 'front' | 'back',
  ): Promise<string> {
    const occupant = await this.occupantRepo.findOne({
      where: { id: occupantId, booking_id: bookingId },
      relations: ['booking'],
    });
    if (!occupant) throw new NotFoundException('Occupant not found');
    const assetId =
      side === 'back'
        ? occupant.id_document_back_asset_id
        : occupant.id_document_front_asset_id;
    if (!assetId) throw new NotFoundException('ID document not uploaded');
    const guestUserId = occupant.booking?.guest_user_id;
    if (!guestUserId) throw new NotFoundException('Booking guest not found');
    return this.staysService.getOccupantIdDocumentPath(
      guestUserId,
      assetId,
      side,
    );
  }

  async getReviews(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = params?.offset ?? 0;
    const [items, total] = await this.reviewRepo.findAndCount({
      relations: ['listing'],
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async getAuditLogs(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(params?.limit ?? 100, 500);
    const offset = params?.offset ?? 0;
    const [items, total] = await this.auditRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
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
    return {
      listing_frozen: true,
      message: 'Host listing access frozen. They can still book.',
    };
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
    void this.domainEvents.publish(EVENTS.LISTING_PUBLISHED, 'stays', {
      listingId,
      hostUserId: listing.host_user_id,
    });
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
