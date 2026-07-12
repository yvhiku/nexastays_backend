import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StaysListing,
  StaysListingRules,
  StaysListingMedia,
  StaysListingUnitType,
  StaysRatePlan,
  StaysCheckInContact,
} from '../entities';
import { HostsService } from '../hosts/hosts.service';
import { detectImageType } from '../../../common/utils/image-type.util';
import { detectVideoType } from '../../../common/utils/video-type.util';
import type { CreateHostListingDto } from '../dto/create-host-listing.dto';
import type { UpdateHostListingDto } from '../dto/update-host-listing.dto';

const PAUSABLE_STATUSES: StaysListing['status'][] = ['LIVE', 'APPROVED'];
const EDITABLE_STATUSES: StaysListing['status'][] = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'LIVE',
  'PAUSED',
];

const LISTING_UPLOAD_DIR = 'uploads/host';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

@Injectable()
export class HostListingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hostsService: HostsService,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysListingRules)
    private readonly rulesRepo: Repository<StaysListingRules>,
    @InjectRepository(StaysRatePlan)
    private readonly ratePlanRepo: Repository<StaysRatePlan>,
    @InjectRepository(StaysCheckInContact)
    private readonly checkInContactRepo: Repository<StaysCheckInContact>,
    @InjectRepository(StaysListingMedia)
    private readonly mediaRepo: Repository<StaysListingMedia>,
    @InjectRepository(StaysListingUnitType)
    private readonly unitTypeRepo: Repository<StaysListingUnitType>,
  ) {}

  async getHostListings(userId: string) {
    const listings = await this.listingRepo.find({
      where: { host_user_id: userId },
      relations: ['rate_plan', 'rules', 'media', 'unit_types'],
      order: { created_at: 'DESC' },
    });
    return listings.map((l) => this.toHostListingSummary(l));
  }

  async getHostListingById(userId: string, listingId: string) {
    const listing = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'media',
      'check_in_contact',
      'unit_types',
    ]);
    return this.toHostListingDetail(listing);
  }

  async updateListing(
    userId: string,
    listingId: string,
    dto: UpdateHostListingDto,
  ) {
    const listing = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'check_in_contact',
    ]);
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'This listing cannot be edited in its current status.',
      );
    }

    if (dto.title != null) listing.title = dto.title;
    if (dto.listing_type != null) listing.listing_type = dto.listing_type;
    if (dto.city != null) listing.city = dto.city;
    if (dto.address !== undefined) listing.address_encrypted = dto.address;
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.checkin_time != null) listing.checkin_time = dto.checkin_time;
    if (dto.checkout_time != null) listing.checkout_time = dto.checkout_time;
    if (dto.instant_booking != null) listing.instant_booking = dto.instant_booking;

    await this.listingRepo.save(listing);

    if (dto.rules && listing.rules) {
      if (dto.rules.pets_policy != null) {
        listing.rules.pets_policy = dto.rules.pets_policy;
      }
      if (dto.rules.smoking_policy != null) {
        listing.rules.smoking_policy = dto.rules.smoking_policy;
      }
      if (dto.rules.max_guests != null) {
        listing.rules.max_guests = dto.rules.max_guests;
      }
      if (dto.rules.amenities != null) {
        listing.rules.amenities = dto.rules.amenities;
      }
      if (dto.rules.cancellation_policy != null) {
        listing.rules.cancellation_policy = dto.rules.cancellation_policy;
      }
      await this.rulesRepo.save(listing.rules);
    }

    if (dto.rate_plan && listing.rate_plan) {
      if (dto.rate_plan.currency != null) {
        listing.rate_plan.currency = dto.rate_plan.currency;
      }
      if (dto.rate_plan.base_price != null) {
        listing.rate_plan.base_price = dto.rate_plan.base_price;
      }
      if (dto.rate_plan.weekend_price !== undefined) {
        listing.rate_plan.weekend_price = dto.rate_plan.weekend_price;
      }
      if (dto.rate_plan.cleaning_fee != null) {
        listing.rate_plan.cleaning_fee = dto.rate_plan.cleaning_fee;
      }
      await this.ratePlanRepo.save(listing.rate_plan);
    }

    if (dto.check_in_contact) {
      let contact = listing.check_in_contact;
      if (!contact) {
        contact = this.checkInContactRepo.create({ listing_id: listing.id });
      }
      if (dto.check_in_contact.full_name != null) {
        contact.full_name = dto.check_in_contact.full_name;
      }
      if (dto.check_in_contact.phone != null) {
        contact.phone_encrypted = dto.check_in_contact.phone;
      }
      if (dto.check_in_contact.role != null) {
        contact.role = dto.check_in_contact.role;
      }
      if (dto.check_in_contact.access_instructions !== undefined) {
        contact.access_instructions = dto.check_in_contact.access_instructions;
      }
      await this.checkInContactRepo.save(contact);
    }

    const refreshed = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'media',
      'check_in_contact',
    ]);
    return {
      ...this.toHostListingDetail(refreshed),
      message: 'Listing updated successfully.',
    };
  }

  async pauseListing(userId: string, listingId: string) {
    const listing = await this.requireOwnedListing(userId, listingId);
    if (!PAUSABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'Only live or approved listings can be paused.',
      );
    }
    listing.status = 'PAUSED';
    await this.listingRepo.save(listing);
    return {
      id: listing.id,
      status: listing.status,
      message: 'Listing paused and hidden from search results.',
    };
  }

  async resumeListing(userId: string, listingId: string) {
    const listing = await this.requireOwnedListing(userId, listingId);
    if (listing.status !== 'PAUSED') {
      throw new BadRequestException('Only paused listings can be resumed.');
    }
    listing.status = 'LIVE';
    await this.listingRepo.save(listing);
    return {
      id: listing.id,
      status: listing.status,
      message: 'Listing is live again and visible in search.',
    };
  }

  private async requireOwnedListing(
    userId: string,
    listingId: string,
    relations: string[] = [],
  ): Promise<StaysListing> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations,
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.host_user_id !== userId) {
      throw new ForbiddenException('You do not own this listing');
    }
    return listing;
  }

  private toHostListingSummary(listing: StaysListing) {
    return {
      id: listing.id,
      title: listing.title,
      listing_type: listing.listing_type,
      booking_model: listing.booking_model,
      city: listing.city,
      country: listing.country ?? 'MA',
      neighborhood: listing.neighborhood,
      postal_code: listing.postal_code,
      building_name: listing.building_name,
      landmark: listing.landmark,
      status: listing.status,
      description: listing.description,
      checkin_time: listing.checkin_time,
      checkout_time: listing.checkout_time,
      instant_booking: listing.instant_booking,
      address: listing.address_encrypted,
      geo_lat: listing.geo_lat != null ? Number(listing.geo_lat) : null,
      geo_lng: listing.geo_lng != null ? Number(listing.geo_lng) : null,
      property_details: listing.property_details ?? {},
      safety_features: listing.safety_features ?? {},
      policies: listing.policies ?? {},
      rate_plan: listing.rate_plan
        ? {
            base_price: Number(listing.rate_plan.base_price),
            weekend_price: listing.rate_plan.weekend_price
              ? Number(listing.rate_plan.weekend_price)
              : null,
            cleaning_fee: Number(listing.rate_plan.cleaning_fee || 0),
            currency: listing.rate_plan.currency,
          }
        : null,
      rules: listing.rules
        ? {
            max_guests: listing.rules.max_guests,
            pets_policy: listing.rules.pets_policy,
            smoking_policy: listing.rules.smoking_policy,
            amenities: listing.rules.amenities,
            cancellation_policy: listing.rules.cancellation_policy,
            quiet_hours: listing.rules.quiet_hours,
            couples_welcome: listing.rules.couples_welcome,
          }
        : null,
      media: (listing.media || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((m) => ({
          asset_id: m.asset_id,
          kind: m.kind,
          sort_order: m.sort_order ?? 0,
          category: m.category ?? null,
          unit_type_id: m.unit_type_id ?? null,
          is_cover: m.is_cover ?? false,
        })),
      unit_types: (listing.unit_types || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((u) => ({
          id: u.id,
          kind: u.kind,
          name: u.name,
          quantity: u.quantity,
          max_guests: u.max_guests,
          bed_config: u.bed_config ?? [],
          size_sqm: u.size_sqm != null ? Number(u.size_sqm) : null,
          amenities: u.amenities ?? [],
          pricing_unit: u.pricing_unit,
          base_price: Number(u.base_price),
          currency: u.currency,
          details: u.details ?? {},
          sort_order: u.sort_order,
          is_active: u.is_active,
        })),
      created_at: listing.created_at,
    };
  }

  private toHostListingDetail(listing: StaysListing) {
    const contact = listing.check_in_contact;
    return {
      ...this.toHostListingSummary(listing),
      check_in_contact: contact
        ? {
            full_name: contact.full_name,
            phone: contact.phone_encrypted,
            role: contact.role,
            access_instructions: contact.access_instructions,
          }
        : null,
    };
  }

  async createListing(
    userId: string,
    dto: CreateHostListingDto,
  ) {
    const canList = await this.hostsService.canList(userId);
    if (!canList) {
      const profile = await this.hostsService.getHostProfileOrNull(userId);
      if (profile?.listing_frozen) {
        throw new BadRequestException(
          'Your host account is temporarily frozen. You can still book stays. Contact support to restore listing access.',
        );
      }
      throw new BadRequestException(
        'Host verification required. Your host application must be approved before publishing listings.',
      );
    }

    if (!dto.media || dto.media.length < 12) {
      throw new BadRequestException(
        'At least 12 photos plus a walkthrough video are required.',
      );
    }

    const walkthroughCount = dto.media.filter((m) => m.kind === 'WALKTHROUGH').length;
    if (walkthroughCount < 1) {
      throw new BadRequestException('A walkthrough video is required.');
    }

    return this.dataSource.transaction(async (manager) => {
      const listingRepo = manager.getRepository(StaysListing);
      const rulesRepo = manager.getRepository(StaysListingRules);
      const ratePlanRepo = manager.getRepository(StaysRatePlan);
      const checkInRepo = manager.getRepository(StaysCheckInContact);
      const mediaRepo = manager.getRepository(StaysListingMedia);
      const unitTypeRepo = manager.getRepository(StaysListingUnitType);

      const defaultBookingModel =
        dto.booking_model ??
        (dto.listing_type === 'HOTEL'
          ? 'ROOM_TYPES'
          : dto.listing_type === 'HOSTEL'
            ? 'DORM_AND_PRIVATE'
            : 'ENTIRE_PROPERTY');

      const listing = listingRepo.create({
        host_user_id: userId,
        title: dto.title,
        listing_type: dto.listing_type,
        booking_model: defaultBookingModel,
        city: dto.city,
        country: dto.country ?? 'MA',
        neighborhood: dto.neighborhood ?? null,
        postal_code: dto.postal_code ?? null,
        building_name: dto.building_name ?? null,
        landmark: dto.landmark ?? null,
        address_encrypted: dto.address ?? null,
        geo_lat: dto.geo_lat ?? null,
        geo_lng: dto.geo_lng ?? null,
        property_details: dto.property_details ?? {},
        safety_features: dto.safety_features ?? {},
        policies: dto.policies ?? {},
        status: 'SUBMITTED',
        checkin_time: dto.checkin_time ?? '14:00',
        checkout_time: dto.checkout_time ?? '11:00',
        description: dto.description ?? null,
        instant_booking: dto.instant_booking ?? false,
      });
      await listingRepo.save(listing);

      const rules = rulesRepo.create({
        listing_id: listing.id,
        pets_policy: dto.rules?.pets_policy ?? 'NO',
        smoking_policy: dto.rules?.smoking_policy ?? 'NOT_ALLOWED',
        quiet_hours: dto.rules?.quiet_hours ?? false,
        couples_welcome: dto.rules?.couples_welcome ?? true,
        max_guests: dto.rules?.max_guests ?? 4,
        amenities: dto.rules?.amenities ?? [],
        cancellation_policy: dto.rules?.cancellation_policy ?? 'MODERATE',
      });
      await rulesRepo.save(rules);

      const ratePlan = ratePlanRepo.create({
        listing_id: listing.id,
        currency: dto.rate_plan.currency ?? 'MAD',
        base_price: dto.rate_plan.base_price,
        weekend_price: dto.rate_plan.weekend_price ?? null,
        cleaning_fee: dto.rate_plan.cleaning_fee ?? 0,
        deposit_policy_text: dto.rate_plan.deposit_policy_text ?? null,
      });
      await ratePlanRepo.save(ratePlan);

      const contact = checkInRepo.create({
        listing_id: listing.id,
        full_name: dto.check_in_contact.full_name,
        phone_encrypted: dto.check_in_contact.phone,
        role: dto.check_in_contact.role,
        access_instructions: dto.check_in_contact.access_instructions ?? null,
      });
      await checkInRepo.save(contact);

      const unitTypesInput =
        dto.unit_types && dto.unit_types.length > 0
          ? dto.unit_types
          : [
              {
                kind:
                  dto.listing_type === 'VILLA'
                    ? ('VILLA_UNIT' as const)
                    : dto.listing_type === 'HOTEL'
                      ? ('HOTEL_ROOM' as const)
                      : dto.listing_type === 'HOSTEL'
                        ? ('HOSTEL_PRIVATE' as const)
                        : dto.listing_type === 'RIAD'
                          ? ('RIAD_ROOM' as const)
                          : ('APARTMENT_UNIT' as const),
                name: dto.title,
                quantity: 1,
                max_guests: dto.rules?.max_guests ?? 4,
                pricing_unit: 'NIGHT' as const,
                base_price: dto.rate_plan.base_price,
                currency: dto.rate_plan.currency ?? 'MAD',
                sort_order: 0,
                is_active: true,
              },
            ];

      for (let i = 0; i < unitTypesInput.length; i++) {
        const u = unitTypesInput[i];
        await unitTypeRepo.save(
          unitTypeRepo.create({
            listing_id: listing.id,
            kind: u.kind,
            name: u.name,
            quantity: u.quantity ?? 1,
            max_guests: u.max_guests ?? 2,
            bed_config: u.bed_config ?? [],
            size_sqm: u.size_sqm ?? null,
            amenities: u.amenities ?? [],
            pricing_unit: u.pricing_unit ?? 'NIGHT',
            base_price: u.base_price,
            currency: u.currency ?? 'MAD',
            details: u.details ?? {},
            sort_order: u.sort_order ?? i,
            is_active: u.is_active ?? true,
          }),
        );
      }

      for (let i = 0; i < dto.media.length; i++) {
        const m = dto.media[i];
        await this.assertOwnedListingAsset(userId, m.asset_id, m.kind);
        const media = mediaRepo.create({
          listing_id: listing.id,
          kind: m.kind,
          asset_id: m.asset_id,
          sort_order: m.sort_order ?? i,
          is_required: m.kind === 'WALKTHROUGH',
          category: m.category ?? null,
          is_cover: m.is_cover ?? false,
        });
        await mediaRepo.save(media);
      }

      return {
        id: listing.id,
        status: 'SUBMITTED',
        message: 'Listing submitted for review. You will be notified once approved.',
      };
    });
  }

  private async assertOwnedListingAsset(
    userId: string,
    assetId: string,
    kind: string,
  ): Promise<void> {
    const dir = path.join(LISTING_UPLOAD_DIR, userId, 'listing');
    const prefixes =
      kind === 'WALKTHROUGH'
        ? [`walkthrough_${assetId}`]
        : [`photo_${assetId}`];
    const exts =
      kind === 'WALKTHROUGH'
        ? ['.mp4', '.webm']
        : ['.jpg', '.jpeg', '.png', '.webp'];
    for (const prefix of prefixes) {
      for (const ext of exts) {
        try {
          await fs.access(path.join(dir, `${prefix}${ext}`));
          return;
        } catch {
          /* try next */
        }
      }
    }
    throw new BadRequestException(
      'Invalid media asset_id — upload the file first as this host',
    );
  }

  async uploadListingPhoto(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_PHOTO_SIZE) {
      throw new BadRequestException(`Photo too large. Max ${MAX_PHOTO_SIZE / 1024 / 1024}MB`);
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Invalid image. Use JPEG, PNG, or WebP');
    }
    const ext = detected === 'png' ? '.png' : detected === 'webp' ? '.webp' : '.jpg';
    const assetId = randomUUID();
    const dir = path.join(LISTING_UPLOAD_DIR, userId, 'listing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `photo_${assetId}${ext}`),
      file.buffer,
    );
    return { asset_id: assetId };
  }

  async uploadListingWalkthrough(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new BadRequestException(`Video too large. Max ${MAX_VIDEO_SIZE / 1024 / 1024}MB`);
    }
    const detected = detectVideoType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Invalid video file. Only MP4/MOV (ftyp) or WebM are allowed.',
      );
    }
    const assetId = randomUUID();
    const ext = detected === 'webm' ? '.webm' : '.mp4';
    const dir = path.join(LISTING_UPLOAD_DIR, userId, 'listing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `walkthrough_${assetId}${ext}`),
      file.buffer,
    );
    return { asset_id: assetId };
  }
}
