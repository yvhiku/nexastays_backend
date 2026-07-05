import {
  BadRequestException,
  Injectable,
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
  StaysRatePlan,
  StaysCheckInContact,
} from '../entities';
import { HostsService } from '../hosts/hosts.service';
import { detectImageType } from '../../compliance/image-type.util';
import type { CreateHostListingDto } from '../dto/create-host-listing.dto';

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
  ) {}

  async getHostListings(userId: string) {
    const listings = await this.listingRepo.find({
      where: { host_user_id: userId },
      relations: ['rate_plan', 'rules', 'host'],
      order: { created_at: 'DESC' },
    });
    return listings.map((l) => ({
      id: l.id,
      title: l.title,
      listing_type: l.listing_type,
      city: l.city,
      status: l.status,
      description: l.description,
      rate_plan: l.rate_plan
        ? {
            base_price: Number(l.rate_plan.base_price),
            weekend_price: l.rate_plan.weekend_price
              ? Number(l.rate_plan.weekend_price)
              : null,
            cleaning_fee: Number(l.rate_plan.cleaning_fee || 0),
            currency: l.rate_plan.currency,
          }
        : null,
      rules: l.rules
        ? {
            max_guests: l.rules.max_guests,
            pets_policy: l.rules.pets_policy,
            amenities: l.rules.amenities,
          }
        : null,
      created_at: l.created_at,
    }));
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

      const listing = listingRepo.create({
        host_user_id: userId,
        title: dto.title,
        listing_type: dto.listing_type,
        city: dto.city,
        address_encrypted: dto.address ?? null,
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
        phone_encrypted: dto.check_in_contact.phone, // Store plain for MVP
        role: dto.check_in_contact.role,
      });
      await checkInRepo.save(contact);

      for (let i = 0; i < dto.media.length; i++) {
        const m = dto.media[i];
        const media = mediaRepo.create({
          listing_id: listing.id,
          kind: m.kind,
          asset_id: m.asset_id,
          sort_order: m.sort_order ?? i,
          is_required: m.kind === 'WALKTHROUGH',
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
    const assetId = randomUUID();
    const ext = '.mp4'; // Accept any; store as mp4 for simplicity
    const dir = path.join(LISTING_UPLOAD_DIR, userId, 'listing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `walkthrough_${assetId}${ext}`),
      file.buffer,
    );
    return { asset_id: assetId };
  }
}
