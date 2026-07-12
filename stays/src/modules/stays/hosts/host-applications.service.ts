import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { HostOnboardingService } from './host-onboarding.service';
import type { SubmitHostOnboardingDto } from '../dto/submit-host-onboarding.dto';
import type { StaysUserContext } from './host-onboarding.types';

const HOST_VERIFY_UPLOAD_DIR = 'uploads/host';
const VERIFY_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
export type HostVerificationDocKind = 'front' | 'back' | 'selfie';

/**
 * Backward-compatible API aliases for host onboarding (stays_host_profiles only).
 */
@Injectable()
export class HostApplicationsService {
  constructor(
    private readonly hostOnboarding: HostOnboardingService,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
  ) {}

  async submit(
    user: StaysUserContext,
    data: {
      full_name?: string;
      email?: string;
      identity_reused?: boolean;
      hosting_policies_accepted?: boolean;
    },
  ): Promise<{ id: string; status: string }> {
    const dto: SubmitHostOnboardingDto = {
      full_name: data.full_name,
      email: data.email,
      identity_reused: data.identity_reused,
      use_existing_kyc: true,
      hosting_policies_accepted: data.hosting_policies_accepted,
      source: 'MOBILE',
      submitted_from: 'MOBILE_BECOME_HOST',
    };
    const result = await this.hostOnboarding.submitHostOnboarding(user, dto, {
      source: 'MOBILE',
      submitted_from: 'MOBILE_BECOME_HOST',
      requirePolicies: true,
    });
    return { id: result.id, status: result.status };
  }

  async getStatusByUserId(applicantUserId: string) {
    return this.hostOnboarding.getLegacyApplicationStatus(applicantUserId);
  }

  async list(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.hostOnboarding.listForAdmin({
      application_status: params?.status,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async getById(id: string): Promise<StaysHostProfile> {
    const profile = await this.hostProfileRepo.findOne({ where: { id } });
    if (profile) return profile;
    const legacy = await this.hostOnboarding.findProfileByLegacyApplicationId(id);
    if (legacy) return legacy;
    throw new NotFoundException('Host application not found');
  }

  async approve(id: string, reviewedBy: string) {
    const byProfile = await this.hostProfileRepo.findOne({ where: { id } });
    if (byProfile) {
      return this.hostOnboarding.approve(id, reviewedBy);
    }
    return this.hostOnboarding.approveLegacyApplication(id, reviewedBy);
  }

  async reject(id: string, reviewedBy: string, reason: string) {
    const byProfile = await this.hostProfileRepo.findOne({ where: { id } });
    if (byProfile) {
      return this.hostOnboarding.reject(id, reason, reviewedBy);
    }
    return this.hostOnboarding.rejectLegacyApplication(id, reason, reviewedBy);
  }

  async getVerificationDocumentPath(
    applicationId: string,
    kind: HostVerificationDocKind,
  ): Promise<string> {
    const profile = await this.getById(applicationId);
    const prefix =
      kind === 'front' ? 'id_front' : kind === 'back' ? 'id_back' : 'selfie';
    const assetId =
      kind === 'front'
        ? profile.document_front_asset_id
        : kind === 'back'
          ? profile.document_back_asset_id
          : profile.selfie_asset_id;
    if (!assetId?.trim()) {
      throw new NotFoundException(`${kind} document not uploaded`);
    }
    const dir = path.resolve(
      process.cwd(),
      HOST_VERIFY_UPLOAD_DIR,
      profile.user_id,
      'verification',
    );
    for (const ext of VERIFY_EXTS) {
      const fullPath = path.join(dir, `${prefix}_${assetId}${ext}`);
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        /* try next */
      }
    }
    throw new NotFoundException(`${kind} document file not found`);
  }
}
