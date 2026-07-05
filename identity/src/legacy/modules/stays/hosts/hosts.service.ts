import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { HostOnboardingService } from './host-onboarding.service';
import type { SubmitHostOnboardingDto } from '../dto/submit-host-onboarding.dto';
import {
  detectImageType,
  type AllowedImageType,
} from '../../compliance/image-type.util';

const HOST_UPLOAD_DIR = 'uploads/host';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class HostsService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    private readonly hostOnboarding: HostOnboardingService,
  ) {}

  async getHostVerificationStatus(userId: string) {
    return this.hostOnboarding.getVerificationStatus(userId);
  }

  async submitHostVerification(
    userId: string,
    data: {
      document_type?: string;
      document_number_hash?: string;
      document_front_asset_id?: string;
      document_back_asset_id?: string;
      selfie_asset_id?: string;
      use_existing_kyc?: boolean;
    },
  ) {
    const dto: SubmitHostOnboardingDto = {
      document_type: data.document_type,
      document_number_hash: data.document_number_hash,
      document_front_asset_id: data.document_front_asset_id,
      document_back_asset_id: data.document_back_asset_id,
      selfie_asset_id: data.selfie_asset_id,
      use_existing_kyc: data.use_existing_kyc,
      source: 'WEB',
      submitted_from: 'WEB_HOST_KYC',
    };
    const result = await this.hostOnboarding.submitHostOnboarding(userId, dto, {
      source: 'WEB',
      submitted_from: 'WEB_HOST_KYC',
      requireConsumer: false,
      requirePolicies: false,
    });
    return {
      status: result.application_status,
      application_status: result.application_status,
      identity_status: result.identity_status,
      message: result.message,
    };
  }

  async isHostVerified(userId: string): Promise<boolean> {
    return this.hostOnboarding.canList(userId);
  }

  async getHostProfileOrNull(userId: string): Promise<StaysHostProfile | null> {
    return this.hostOnboarding.resolveProfileForUser(userId);
  }

  async canList(userId: string): Promise<boolean> {
    return this.hostOnboarding.canList(userId);
  }

  private validateImageFile(file: Express.Multer.File | undefined): void {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Invalid file: not a valid JPEG, PNG, or WebP image',
      );
    }
  }

  private getExtension(detected: AllowedImageType): string {
    if (detected === 'png') return '.png';
    if (detected === 'webp') return '.webp';
    return '.jpg';
  }

  async uploadDocumentFront(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    this.validateImageFile(file);
    const detected = detectImageType(file!.buffer)!;
    const assetId = randomUUID();
    const ext = this.getExtension(detected);
    const dir = path.join(HOST_UPLOAD_DIR, userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `document_front_${assetId}${ext}`),
      file!.buffer,
    );
    return { asset_id: assetId };
  }

  async uploadDocumentBack(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    this.validateImageFile(file);
    const detected = detectImageType(file!.buffer)!;
    const assetId = randomUUID();
    const ext = this.getExtension(detected);
    const dir = path.join(HOST_UPLOAD_DIR, userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `document_back_${assetId}${ext}`),
      file!.buffer,
    );
    return { asset_id: assetId };
  }

  async uploadSelfie(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    this.validateImageFile(file);
    const detected = detectImageType(file!.buffer)!;
    const assetId = randomUUID();
    const ext = this.getExtension(detected);
    const dir = path.join(HOST_UPLOAD_DIR, userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `selfie_${assetId}${ext}`),
      file!.buffer,
    );
    return { asset_id: assetId };
  }
}
