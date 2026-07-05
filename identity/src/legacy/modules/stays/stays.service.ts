import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { StaysListing } from './entities/stays-listing.entity';
import { StaysBooking } from './entities/stays-booking.entity';
import { StaysBookingOccupant } from './entities/stays-booking-occupant.entity';
import { StaysAvailabilityBlock } from './entities/stays-availability-block.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { HostsService } from './hosts/hosts.service';
import { StaysAvailabilityService } from './services/stays-availability.service';
import { StaysAuditService } from './services/stays-audit.service';

const GUEST_FEE_PCT = 0.02;
const HOST_FEE_PCT = 0.02;

@Injectable()
export class StaysService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysAvailabilityBlock)
    private readonly availabilityRepo: Repository<StaysAvailabilityBlock>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly hostsService: HostsService,
    private readonly availabilityService: StaysAvailabilityService,
    private readonly auditService: StaysAuditService,
  ) {}

  async isGuestVerifiedForBooking(userId: string): Promise<boolean> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    return user.kyc_status === 'APPROVED';
  }

  private static readonly LISTING_UPLOAD_DIR = 'uploads/host';
  private static readonly PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

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
      relations: ['rate_plan', 'rules', 'media', 'host'],
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

  private toListingResponse(
    listing: StaysListing,
    addressMode: 'full' | 'masked' | null,
  ) {
    const host = listing.host as User | undefined;
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
      address:
        addressMode === 'full' && listing.address_encrypted
          ? '[revealed after booking]'
          : null,
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
      host: host
        ? {
            id: host.id,
            full_name: addressMode === 'full' ? host.full_name : null,
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
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const isVerified = await this.isGuestVerifiedForBooking(userId);
    if (!isVerified) {
      throw new BadRequestException(
        'Identity verification required to book. Please complete verification in Nexa Pay or Nexa Go.',
      );
    }

    // Idempotency: return existing booking if same (userId, idempotency_key)
    if (dto.idempotency_key) {
      const existing = await this.bookingRepo.findOne({
        where: {
          guest_user_id: userId,
          idempotency_key: dto.idempotency_key,
        },
        relations: ['listing', 'listing.host', 'listing.check_in_contact'],
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

        const checkin = new Date(dto.checkin_date);
        const checkout = new Date(dto.checkout_date);

        if (checkout <= checkin) {
          throw new BadRequestException('Checkout must be after check-in');
        }

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
              relations: ['listing', 'listing.host', 'listing.check_in_contact'],
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
        const guestFee = Math.round(subtotal * GUEST_FEE_PCT * 100) / 100;
        const hostFee = Math.round(subtotal * HOST_FEE_PCT * 100) / 100;
        const totalPaid = subtotal + guestFee;
        const payoutAmount = subtotal - hostFee;

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

        const withRelations = await bookingRepo.findOne({
          where: { id: newBooking.id },
          relations: ['listing', 'listing.host', 'listing.check_in_contact'],
        });

        return this.toBookingResponse(withRelations ?? newBooking);
    });
  }

  async getBookingById(bookingId: string, userId: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing', 'listing.host', 'listing.check_in_contact', 'occupants'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.guest_user_id !== userId) {
      const listing = booking.listing as StaysListing;
      if (listing.host_user_id !== userId) {
        throw new NotFoundException('Booking not found');
      }
    }

    const canReveal =
      booking.status === 'CONFIRMED' &&
      (await this.canRevealAddressAndContact(
        booking.listing_id,
        booking.guest_user_id,
      ));

    return this.toBookingResponse(booking, canReveal, true);
  }

  async getGuestBookings(guestUserId: string) {
    const bookings = await this.bookingRepo.find({
      where: { guest_user_id: guestUserId },
      relations: ['listing', 'listing.check_in_contact'],
      order: { created_at: 'DESC' },
    });
    return bookings.map((b) => this.toBookingResponse(b, false));
  }

  async getHostBookings(hostUserId: string) {
    const bookings = await this.bookingRepo.find({
      where: {},
      relations: ['listing', 'listing.check_in_contact', 'guest', 'occupants'],
      order: { created_at: 'DESC' },
    });
    const filtered = bookings.filter(
      (b) => (b.listing as StaysListing).host_user_id === hostUserId,
    );
    return filtered.map((b) => ({
      ...this.toBookingResponse(b, false, true),
      guest_name: (b.guest as User)?.full_name ?? null,
      guest_phone: (b.guest as User)?.phone_number ?? null,
    }));
  }

  private toBookingResponse(
    booking: StaysBooking,
    revealContact = false,
    includeOccupants = false,
  ) {
    const listing = booking.listing as StaysListing & {
      check_in_contact?: { full_name: string; phone_encrypted?: string; role?: string };
      host?: User;
    };
    return {
      id: booking.id,
      listing_id: booking.listing_id,
      status: booking.status,
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
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            city: listing.city,
            address: revealContact && listing.address_encrypted ? listing.address_encrypted : null,
            check_in_contact:
              revealContact && listing.check_in_contact
                ? {
                    full_name: listing.check_in_contact.full_name,
                    phone: listing.check_in_contact.phone_encrypted ?? '[contact host]',
                    role: listing.check_in_contact.role,
                  }
                : null,
          }
        : null,
      occupants:
        includeOccupants && booking.occupants?.length
          ? booking.occupants.map((o) => ({
              full_name: o.full_name,
              id_number: o.id_number ?? null,
              is_primary: o.is_primary,
            }))
          : undefined,
    };
  }
}
