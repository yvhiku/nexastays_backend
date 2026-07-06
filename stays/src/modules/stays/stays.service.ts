import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { StaysListing } from './entities/stays-listing.entity';
import { StaysBooking } from './entities/stays-booking.entity';
import { StaysBookingOccupant } from './entities/stays-booking-occupant.entity';
import { StaysPaymentIntent } from './entities/stays-payment-intent.entity';
import { StaysAvailabilityBlock } from './entities/stays-availability-block.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  assertMinOneNightStay,
  parseBookingDateOnly,
} from './utils/booking-date.util';
import { HostsService } from './hosts/hosts.service';
import { StaysAvailabilityService } from './services/stays-availability.service';
import { StaysAuditService } from './services/stays-audit.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { detectImageType } from '../../common/utils/image-type.util';
import { StaysKycPolicyService } from '../../common/identity/stays-kyc-policy.service';
import type { IdentitySnapshot } from '../../common/identity/identity-snapshot.types';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import { BookingLifecycleService } from './services/booking-lifecycle.service';
import { StaysReviewsService } from './services/stays-reviews.service';

@Injectable()
export class StaysService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysPaymentIntent)
    private readonly paymentIntentRepo: Repository<StaysPaymentIntent>,
    @InjectRepository(StaysAvailabilityBlock)
    private readonly availabilityRepo: Repository<StaysAvailabilityBlock>,
    private readonly hostsService: HostsService,
    private readonly availabilityService: StaysAvailabilityService,
    private readonly auditService: StaysAuditService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly kycPolicy: StaysKycPolicyService,
    private readonly domainEvents: DomainEventsService,
    private readonly lifecycleService: BookingLifecycleService,
    private readonly reviewsService: StaysReviewsService,
  ) {}

  isGuestVerifiedForBooking(snapshot?: IdentitySnapshot | null): boolean {
    return this.kycPolicy.meetsGuestBookingPolicy(snapshot);
  }

  private static readonly LISTING_UPLOAD_DIR = 'uploads/host';
  private static readonly GUEST_OCCUPANT_UPLOAD_DIR = 'uploads/guest';
  private static readonly PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
  private static readonly MAX_OCCUPANT_DOC_SIZE = 5 * 1024 * 1024;

  async uploadOccupantIdDocument(
    userId: string,
    file: Express.Multer.File | undefined,
    side: 'front' | 'back',
    auditContext?: { ip?: string; userAgent?: string },
  ): Promise<{ asset_id: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > StaysService.MAX_OCCUPANT_DOC_SIZE) {
      throw new BadRequestException(
        `File too large. Max ${StaysService.MAX_OCCUPANT_DOC_SIZE / 1024 / 1024}MB`,
      );
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Invalid image. Use JPEG, PNG, or WebP');
    }
    const ext =
      detected === 'png' ? '.png' : detected === 'webp' ? '.webp' : '.jpg';
    const prefix = side === 'back' ? 'id_back' : 'id_front';
    const assetId = randomUUID();
    const dir = path.join(
      StaysService.GUEST_OCCUPANT_UPLOAD_DIR,
      userId,
      'occupant-id',
    );
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${prefix}_${assetId}${ext}`),
      file.buffer,
    );
    await this.auditService.log({
      actorUserId: userId,
      actorRole: 'GUEST',
      entityType: 'OCCUPANT_ID_DOCUMENT',
      entityId: assetId,
      action: 'OCCUPANT_ID_UPLOADED',
      metadata: { side },
      ip: auditContext?.ip,
      userAgent: auditContext?.userAgent,
    });
    return { asset_id: assetId };
  }

  async getOccupantIdDocumentPath(
    guestUserId: string,
    assetId: string,
    side: 'front' | 'back',
  ): Promise<string> {
    const prefix = side === 'back' ? 'id_back' : 'id_front';
    const dir = path.resolve(
      process.cwd(),
      StaysService.GUEST_OCCUPANT_UPLOAD_DIR,
      guestUserId,
      'occupant-id',
    );
    for (const ext of StaysService.PHOTO_EXTS) {
      const fullPath = path.join(dir, `${prefix}_${assetId}${ext}`);
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        /* try next extension */
      }
    }
    throw new NotFoundException('ID document not found');
  }

  async getListingMediaPath(listingId: string, assetId: string): Promise<string> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: ['media'],
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'LIVE' && listing.status !== 'APPROVED') throw new NotFoundException('Listing not found');
    const media = listing.media?.find((m) => m.asset_id === assetId);
    if (!media) throw new NotFoundException('Media not found');
    const dir = path.resolve(
      process.cwd(),
      StaysService.LISTING_UPLOAD_DIR,
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
    for (const ext of StaysService.PHOTO_EXTS) {
      const p = path.join(dir, `photo_${assetId}${ext}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        /* try next ext */
      }
    }
    throw new NotFoundException('Photo file not found');
  }

  async searchListings(params: {
    city?: string;
    checkin_date?: string;
    checkout_date?: string;
    guests?: number;
    verified_walkthrough_only?: boolean;
    instant_booking_only?: boolean;
  }) {
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.rate_plan', 'rp')
      .leftJoinAndSelect('l.rules', 'rules')
      .leftJoinAndSelect('l.media', 'media')
      .where('l.status IN (:...statuses)', { statuses: ['LIVE', 'APPROVED'] });

    if (params.city) {
      qb.andWhere('LOWER(l.city) = LOWER(:city)', { city: params.city });
    }

    if (params.instant_booking_only) {
      qb.andWhere('l.instant_booking = true');
    }

    if (params.checkin_date && params.checkout_date) {
      const checkin = new Date(params.checkin_date);
      const checkout = new Date(params.checkout_date);
      if (checkout > checkin) {
        const unavailable = await this.availabilityService.getUnavailableListingIds(
          checkin,
          checkout,
        );
        if (unavailable.length > 0) {
          qb.andWhere('l.id NOT IN (:...unavailable)', { unavailable });
        }
      }
    }

    const listings = await qb
      .orderBy('l.created_at', 'DESC')
      .take(50)
      .getMany();

    return listings.map((l) => this.toListingResponse(l, null));
  }

  async getListingById(listingId: string, guestUserId?: string | null) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: ['rate_plan', 'rules', 'media'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== 'LIVE' && listing.status !== 'APPROVED') {
      throw new NotFoundException('Listing not found');
    }

    const canRevealAddress = guestUserId
      ? await this.canRevealAddressAndContact(listing.id, guestUserId)
      : false;

    return this.toListingResponse(listing, canRevealAddress ? 'full' : 'masked');
  }

  private async canRevealAddressAndContact(
    listingId: string,
    guestUserId: string,
  ): Promise<boolean> {
    const confirmed = await this.bookingRepo.findOne({
      where: {
        listing_id: listingId,
        guest_user_id: guestUserId,
        status: 'CONFIRMED',
      },
    });
    if (!confirmed) return false;
    // Booking is paid and confirmed - reveal address and contact to guest
    return true;
  }

  private extractNeighborhood(listing: StaysListing): string | null {
    const address = listing.address_encrypted?.trim();
    if (!address) return null;

    const floorRe = /^(étage|etage|floor|level|apt|apartment|appartement|studio)\b/i;
    const isFloor = (text: string) => floorRe.test(text.trim());

    const parts = address
      .replace(/\.\s+/g, ', ')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length < 2) return null;

    const cityLower = listing.city?.toLowerCase() ?? '';
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].toLowerCase() === cityLower && i > 0) {
        const candidate = parts[i - 1];
        return isFloor(candidate) ? null : candidate;
      }
    }

    const candidate = parts[parts.length - 2];
    return isFloor(candidate) ? null : candidate;
  }

  private toListingResponse(
    listing: StaysListing,
    addressMode: 'full' | 'masked' | null,
  ) {
    const hostUserId = listing.host_user_id;
    const rules = listing.rules as { cancellation_policy?: string } | undefined;
    return {
      id: listing.id,
      title: listing.title,
      listing_type: listing.listing_type,
      city: listing.city,
      avg_rating:
        listing.avg_rating != null ? Number(listing.avg_rating) : null,
      review_count: listing.review_count ?? 0,
      geo_lat: listing.geo_lat,
      geo_lng: listing.geo_lng,
      address: listing.address_encrypted ?? null,
      neighborhood: this.extractNeighborhood(listing),
      status: listing.status,
      checkin_time: listing.checkin_time,
      checkout_time: listing.checkout_time,
      description: listing.description,
      instant_booking: listing.instant_booking,
      rate_plan: listing.rate_plan
        ? {
            base_price: Number(listing.rate_plan.base_price),
            weekend_price: listing.rate_plan.weekend_price
              ? Number(listing.rate_plan.weekend_price)
              : null,
            cleaning_fee: Number(listing.rate_plan.cleaning_fee),
            currency: listing.rate_plan.currency,
          }
        : null,
      rules: listing.rules
        ? {
            pets_policy: listing.rules.pets_policy,
            smoking_policy: listing.rules.smoking_policy,
            max_guests: listing.rules.max_guests,
            amenities: listing.rules.amenities,
            cancellation_policy: rules?.cancellation_policy ?? 'MODERATE',
          }
        : null,
      host: hostUserId
        ? {
            id: hostUserId,
            full_name: null,
          }
        : null,
      media: (listing.media || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((m) => ({ asset_id: m.asset_id, kind: m.kind, sort_order: m.sort_order ?? 0 })),
    };
  }

  async createBooking(
    userId: string,
    dto: CreateBookingDto,
    auditContext?: {
      ip?: string;
      userAgent?: string;
      identitySnapshot?: IdentitySnapshot | null;
    },
  ) {
    const isVerified = this.isGuestVerifiedForBooking(auditContext?.identitySnapshot);
    if (!isVerified) {
      throw new BadRequestException(
        'Identity verification required to book. Complete KYC in Nexa Identity first.',
      );
    }

    if (dto.idempotency_key) {
      const existing = await this.bookingRepo.findOne({
        where: {
          guest_user_id: userId,
          idempotency_key: dto.idempotency_key,
        },
        relations: ['listing', 'listing.check_in_contact'],
      });
      if (existing) {
        return this.toBookingResponse(existing);
      }
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const listingRepo = manager.getRepository(StaysListing);
      const bookingRepo = manager.getRepository(StaysBooking);

        // SELECT FOR UPDATE to prevent double-booking (INNER JOIN required: FOR UPDATE cannot apply to nullable side of outer join)
        const listing = await listingRepo
          .createQueryBuilder('l')
          .innerJoinAndSelect('l.rate_plan', 'rp')
          .setLock('pessimistic_write')
          .where('l.id = :id', { id: dto.listing_id })
          .getOne();

        if (!listing) {
          throw new NotFoundException('Listing not found');
        }

        if (listing.status !== 'LIVE' && listing.status !== 'APPROVED') {
          throw new BadRequestException('Listing is not available for booking');
        }

        const checkin = parseBookingDateOnly(dto.checkin_date);
        const checkout = parseBookingDateOnly(dto.checkout_date);
        assertMinOneNightStay(dto.checkin_date, dto.checkout_date);

        // Re-check idempotency inside transaction
        if (dto.idempotency_key) {
          const existingInTxn = await bookingRepo.findOne({
            where: {
              guest_user_id: userId,
              idempotency_key: dto.idempotency_key,
            },
          });
          if (existingInTxn) {
            const loaded = await bookingRepo.findOne({
              where: { id: existingInTxn.id },
              relations: ['listing', 'listing.check_in_contact'],
            });
            if (loaded) return this.toBookingResponse(loaded);
          }
        }

        // Availability check inside transaction
        const available = await this.availabilityService.isListingAvailable(
          dto.listing_id,
          checkin,
          checkout,
        );
        if (!available) {
          throw new ConflictException(
            'Selected dates are no longer available. Please try different dates.',
          );
        }

        const nights = Math.ceil(
          (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24),
        );
        const ratePlan = listing.rate_plan;
        if (!ratePlan) {
          throw new BadRequestException('Listing has no pricing configured');
        }

        const basePrice = Number(ratePlan.base_price);
        const subtotal =
          basePrice * nights + Number(ratePlan.cleaning_fee || 0);
        const { guestFee, hostFee, totalPaid, payoutAmount } =
          this.platformSettings.calculateFees(subtotal);

        const newBooking = bookingRepo.create({
          listing_id: dto.listing_id,
          guest_user_id: userId,
          status: 'PAYMENT_PENDING',
          checkin_date: checkin,
          checkout_date: checkout,
          guest_count: dto.guest_count,
          total_subtotal: subtotal,
          guest_fee: guestFee,
          host_fee: hostFee,
          total_paid: totalPaid,
          payout_amount: payoutAmount,
          currency: ratePlan.currency,
          idempotency_key: dto.idempotency_key || null,
        });

        await bookingRepo.save(newBooking);

        if (dto.occupants?.length) {
          const occupantRepo = manager.getRepository(StaysBookingOccupant);
          for (const o of dto.occupants) {
            await occupantRepo.save(
              occupantRepo.create({
                booking_id: newBooking.id,
                full_name: o.full_name?.trim() || 'Guest',
                id_number: o.id_number?.trim() || null,
                is_primary: !!o.is_primary,
                phone: o.phone?.trim() || null,
                email: o.email?.trim() || null,
                gender: o.gender?.trim() || null,
                id_document_front_asset_id: o.id_document_front_asset_id?.trim() || null,
                id_document_back_asset_id: o.id_document_back_asset_id?.trim() || null,
              }),
            );
          }
        }

        await this.auditService.log({
          actorUserId: userId,
          actorRole: 'GUEST',
          entityType: 'BOOKING',
          entityId: newBooking.id,
          action: 'BOOKING_CREATED',
          metadata: {
            listing_id: dto.listing_id,
            checkin_date: dto.checkin_date,
            checkout_date: dto.checkout_date,
          },
          ip: auditContext?.ip,
          userAgent: auditContext?.userAgent,
        });

        void this.domainEvents.publish(EVENTS.BOOKING_CREATED, 'stays', {
          bookingId: newBooking.id,
          listingId: dto.listing_id,
          guestUserId: userId,
        });

        const withRelations = await bookingRepo.findOne({
          where: { id: newBooking.id },
          relations: ['listing', 'listing.check_in_contact', 'listing.media'],
        });

        return this.toBookingResponse(withRelations ?? newBooking);
    });
  }

  async getBookingById(bookingId: string, userId: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing', 'listing.check_in_contact', 'listing.media', 'occupants'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const listing = booking.listing as StaysListing;
    const isGuest = booking.guest_user_id === userId;
    const isHost = !isGuest && listing?.host_user_id === userId;

    if (!isGuest && !isHost) {
      throw new NotFoundException('Booking not found');
    }

    const canReveal = this.shouldRevealContactForBooking(booking);
    const revealForViewer = isHost ? true : canReveal;
    const extras = await this.lifecycleExtrasForBooking(booking);

    const base = this.toBookingResponse(
      booking,
      revealForViewer,
      true,
      extras,
      isHost,
    );

    if (isHost) {
      return {
        ...base,
        viewer_role: 'HOST' as const,
        guest_name: this.resolveGuestDisplayName(booking),
        guest_phone: this.resolveGuestPhone(booking),
        can_review: false,
        listing: base.listing
          ? {
              ...base.listing,
              address: listing.address_encrypted ?? base.listing.address,
              check_in_contact: null,
            }
          : null,
      };
    }

    return { ...base, viewer_role: 'GUEST' as const };
  }

  private async lifecycleExtrasForBooking(
    booking: StaysBooking,
  ): Promise<{ paymentFailed?: boolean; has_reviewed?: boolean }> {
    const has_reviewed = await this.reviewsService.hasReviewForBooking(booking.id);
    if (booking.status !== 'PAYMENT_PENDING' && booking.status !== 'INITIATED') {
      return { has_reviewed };
    }
    const latest = await this.paymentIntentRepo.findOne({
      where: { booking_id: booking.id },
      order: { created_at: 'DESC' },
    });
    return { paymentFailed: latest?.status === 'FAILED', has_reviewed };
  }

  async getGuestBookings(guestUserId: string) {
    const bookings = await this.bookingRepo.find({
      where: { guest_user_id: guestUserId },
      relations: ['listing', 'listing.check_in_contact', 'listing.media'],
      order: { created_at: 'DESC' },
    });

    const pendingIds = bookings
      .filter((b) => b.status === 'PAYMENT_PENDING' || b.status === 'INITIATED')
      .map((b) => b.id);
    const failedIntentBookingIds = new Set<string>();
    if (pendingIds.length > 0) {
      const intents = await this.paymentIntentRepo.find({
        where: { booking_id: In(pendingIds) },
        order: { created_at: 'DESC' },
      });
      for (const intent of intents) {
        if (intent.status === 'FAILED' && !failedIntentBookingIds.has(intent.booking_id)) {
          failedIntentBookingIds.add(intent.booking_id);
        }
      }
    }

    const reviewedIds = await this.reviewsService.getReviewedBookingIds(
      bookings.map((b) => b.id),
    );

    return bookings.map((b) =>
      this.toBookingResponse(
        b,
        this.shouldRevealContactForBooking(b),
        false,
        {
          paymentFailed: failedIntentBookingIds.has(b.id),
          has_reviewed: reviewedIds.has(b.id),
        },
      ),
    );
  }

  private shouldRevealContactForBooking(booking: StaysBooking): boolean {
    return ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(booking.status);
  }

  async getHostBookings(hostUserId: string) {
    const bookings = await this.bookingRepo.find({
      where: {},
      relations: [
        'listing',
        'listing.check_in_contact',
        'listing.media',
        'occupants',
      ],
      order: { created_at: 'DESC' },
    });
    const filtered = bookings.filter(
      (b) => (b.listing as StaysListing).host_user_id === hostUserId,
    );
    return filtered.map((b) => {
      const response = this.toBookingResponse(b, false, true, {}, true);
      const guestName = this.resolveGuestDisplayName(b);
      return {
        ...response,
        guest_name: guestName,
        guest_phone: this.resolveGuestPhone(b),
      };
    });
  }

  private resolveGuestDisplayName(booking: StaysBooking): string | null {
    const occupants = booking.occupants ?? [];
    if (occupants.length > 0) {
      const primary =
        occupants.find((o) => o.is_primary) ??
        occupants.find((o) => o.full_name?.trim()) ??
        occupants[0];
      const name = primary?.full_name?.trim();
      if (name) return name;
    }
    return null;
  }

  private resolveGuestPhone(booking: StaysBooking): string | null {
    const occupants = booking.occupants ?? [];
    const primary =
      occupants.find((o) => o.is_primary) ??
      occupants.find((o) => o.phone?.trim()) ??
      occupants[0];
    const phone = primary?.phone?.trim();
    return phone || null;
  }

  private toBookingResponse(
    booking: StaysBooking,
    revealContact = false,
    includeOccupants = false,
    extras: { paymentFailed?: boolean; has_reviewed?: boolean } = {},
    hostView = false,
  ) {
    const listing = booking.listing as StaysListing & {
      check_in_contact?: {
        full_name: string;
        phone_encrypted?: string;
        role?: string;
        access_instructions?: string | null;
      };
      media?: Array<{ asset_id: string; kind: string; sort_order?: number }>;
    };
    const contact = listing?.check_in_contact;
    const lifecycleCtx = { paymentFailed: extras.paymentFailed };
    const booking_lifecycle = this.lifecycleService.computeLifecycle(
      booking,
      lifecycleCtx,
    );
    const payment_expires_at =
      booking.status === 'PAYMENT_PENDING' || booking.status === 'INITIATED'
        ? this.lifecycleService.getPaymentExpiresAt(booking.created_at).toISOString()
        : null;

    return {
      id: booking.id,
      listing_id: booking.listing_id,
      status: booking.status,
      booking_lifecycle,
      checkin_date: booking.checkin_date,
      checkout_date: booking.checkout_date,
      guest_count: booking.guest_count,
      total_subtotal: Number(booking.total_subtotal),
      guest_fee: Number(booking.guest_fee),
      host_fee: Number(booking.host_fee),
      total_paid: booking.total_paid ? Number(booking.total_paid) : null,
      payout_amount: booking.payout_amount
        ? Number(booking.payout_amount)
        : null,
      currency: booking.currency,
      created_at: booking.created_at,
      completed_at: booking.completed_at,
      payment_expires_at,
      payment_failed: !!extras.paymentFailed,
      can_review:
        this.lifecycleService.canReview(booking, lifecycleCtx) &&
        !extras.has_reviewed,
      review_blocked_reason:
        !extras.has_reviewed &&
        this.lifecycleService.computeLifecycle(booking, lifecycleCtx) ===
          'COMPLETED' &&
        (listing as StaysListing | undefined)?.host_user_id ===
          booking.guest_user_id
          ? ('OWN_LISTING' as const)
          : undefined,
      can_complain: this.lifecycleService.canComplain(booking, lifecycleCtx),
      can_cancel: this.lifecycleService.canCancel(booking, lifecycleCtx),
      has_reviewed: !!extras.has_reviewed,
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            city: listing.city,
            checkin_time: listing.checkin_time ?? null,
            checkout_time: listing.checkout_time ?? null,
            address: revealContact && listing.address_encrypted ? listing.address_encrypted : null,
            check_in_instructions:
              revealContact && contact?.access_instructions
                ? contact.access_instructions
                : null,
            check_in_contact:
              revealContact && contact
                ? {
                    full_name: contact.full_name,
                    phone: contact.phone_encrypted ?? '[contact host]',
                    role: contact.role,
                    access_instructions: contact.access_instructions ?? null,
                  }
                : null,
            media: (listing.media || [])
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((m) => ({
                asset_id: m.asset_id,
                kind: m.kind,
                sort_order: m.sort_order ?? 0,
              })),
          }
        : null,
      occupants:
        includeOccupants && booking.occupants?.length
          ? booking.occupants.map((o) => ({
              full_name: o.full_name,
              id_number: o.id_number ?? null,
              is_primary: o.is_primary,
              ...(hostView
                ? {
                    phone: o.phone ?? null,
                    email: o.email ?? null,
                    gender: o.gender ?? null,
                  }
                : {}),
            }))
          : undefined,
    };
  }
}
