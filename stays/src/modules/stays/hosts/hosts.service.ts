import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { HostOnboardingService } from './host-onboarding.service';
import type { SubmitHostOnboardingDto } from '../dto/submit-host-onboarding.dto';
import type { StaysUserContext } from './host-onboarding.types';
import { detectImageType } from '../../../common/utils/image-type.util';

const HOST_VERIFY_UPLOAD_DIR = 'uploads/host';
const MAX_DOC_SIZE = 5 * 1024 * 1024;

@Injectable()
export class HostsService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    private readonly hostOnboarding: HostOnboardingService,
  ) {}

  async getHostVerificationStatus(user: StaysUserContext) {
    return this.hostOnboarding.getVerificationStatus(user.userId);
  }

  async submitHostVerification(
    user: StaysUserContext,
    data: SubmitHostOnboardingDto,
  ) {
    const useExisting = data.use_existing_kyc === true;
    const dto: SubmitHostOnboardingDto = {
      ...data,
      use_existing_kyc: useExisting,
      identity_reused: useExisting || data.identity_reused,
      source: data.source ?? 'WEB',
      submitted_from: data.submitted_from ?? 'WEB_BECOME_HOST',
    };
    const result = await this.hostOnboarding.submitHostOnboarding(user, dto, {
      source: 'WEB',
      submitted_from: dto.submitted_from ?? 'WEB_BECOME_HOST',
      requirePolicies: dto.hosting_policies_accepted === true,
    });
    return {
      status: result.application_status,
      application_status: result.application_status,
      identity_status: result.identity_status,
      message: result.message,
    };
  }

  async isHostVerified(userId: string): Promise<boolean> {
    return this.hostOnboarding.isApprovedHost(userId);
  }

  async getHostProfileOrNull(userId: string): Promise<StaysHostProfile | null> {
    return this.hostOnboarding.resolveProfileForUser(userId);
  }

  async canList(userId: string): Promise<boolean> {
    return this.hostOnboarding.isApprovedHost(userId);
  }

  uploadDocumentFront(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    return this.saveHostVerificationImage(userId, file, 'id_front');
  }

  uploadDocumentBack(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    return this.saveHostVerificationImage(userId, file, 'id_back');
  }

  uploadSelfie(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    return this.saveHostVerificationImage(userId, file, 'selfie');
  }

  private async saveHostVerificationImage(
    userId: string,
    file: Express.Multer.File | undefined,
    prefix: string,
  ): Promise<{ asset_id: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_DOC_SIZE) {
      throw new BadRequestException(`File too large. Max ${MAX_DOC_SIZE / 1024 / 1024}MB`);
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Invalid image. Use JPEG, PNG, or WebP');
    }
    const ext = detected === 'png' ? '.png' : detected === 'webp' ? '.webp' : '.jpg';
    const assetId = randomUUID();
    const dir = path.join(HOST_VERIFY_UPLOAD_DIR, userId, 'verification');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${prefix}_${assetId}${ext}`), file.buffer);
    return { asset_id: assetId };
  }
}
