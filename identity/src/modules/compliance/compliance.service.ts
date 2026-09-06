import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { appConfig, sumsubConfig } from '../../common/config/app.config';
import { KycProfile } from './entities/kyc-profile.entity';
import { User } from '../users/entities/user.entity';
import { SubmitKycDto } from './dto/submit-kyc.dto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = 'uploads/kyc';
/** Filename allowlist: only alphanumeric, dot, underscore, hyphen. No path traversal. */
const FILENAME_ALLOWLIST = /^[a-zA-Z0-9._-]+$/;
const MAX_FILES_PER_REQUEST = 1;

import {
  detectImageType,
  mimetypeFromDetected,
  type AllowedImageType,
} from './image-type.util';
import { safeLogger } from '../../common/logging/safe-logger';
import { normalizePhoneOrThrow, tryNormalizePhoneNumber } from '../../common/phone/phone-normalizer';
import { isIdentityLocalUploadDisabled, assertIdentityProviderMediaSyncAllowed } from '../../common/security/upload-storage-policy';
import { deriveIdentityOnboardingState } from '../../common/identity-onboarding';

export type DocumentUploadOptions = {
  side?: 'front' | 'back';
  document_type?: string;
  document_country?: string;
  /** ID from form (manual); stored in KycProfile by submitKyc */
  national_id_number?: string;
  /** ID extracted from document via OCR; stored separately for comparison */
  national_id_number_extracted?: string;
};

/** Identity fields we can read back from a Sumsub applicant. All nullable — never invented. */
export type SumsubIdentityFields = {
  /** ISO YYYY-MM-DD */
  dateOfBirth: string | null;
  fullName: string | null;
  /** ISO-3166 alpha-2 */
  nationality: string | null;
  /** App vocabulary: CNIE | PASSPORT | NATIONAL_ID | DRIVING_LICENSE | RESIDENCE_PERMIT */
  documentType: string | null;
  /** ISO-3166 alpha-2 issuing country */
  documentCountry: string | null;
  /** Raw document number as read by the provider (stored encrypted as *_extracted). */
  documentNumber: string | null;
  /** ISO YYYY-MM-DD document expiry when present. */
  documentValidUntil: string | null;
  email: string | null;
  phone: string | null;
  levelName: string | null;
  reviewStatus: string | null;
  reviewAnswer: string | null;
  attemptCnt: number | null;
  inspectionId: string | null;
};

/** Sumsub returns ISO-3166 alpha-3 country codes; we store alpha-2. Markets we serve + neighbours. */
const SUMSUB_ALPHA3_TO_ALPHA2: Record<string, string> = {
  MAR: 'MA',
  FRA: 'FR',
  ESP: 'ES',
  DZA: 'DZ',
  TUN: 'TN',
  BEL: 'BE',
  NLD: 'NL',
  ITA: 'IT',
  DEU: 'DE',
  GBR: 'GB',
  USA: 'US',
  CAN: 'CA',
  PRT: 'PT',
  CHE: 'CH',
  SAU: 'SA',
  ARE: 'AE',
  QAT: 'QA',
  EGY: 'EG',
  TUR: 'TR',
  SEN: 'SN',
  CIV: 'CI',
  MRT: 'MR',
};

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** Resolve ISO-3166 alpha-2 document country from explicit field or nationality. */
  private resolveDocumentCountry(payload: SubmitKycDto): string {
    for (const candidate of [payload.document_country, payload.nationality]) {
      const code = (candidate ?? '').trim().toUpperCase();
      if (code === 'OTHER') continue;
      if (/^[A-Z]{2}$/.test(code)) return code;
    }
    throw new BadRequestException(
      'document_country must be ISO-3166 alpha-2 (e.g. MA)',
    );
  }

  private validateImageFile(file: Express.Multer.File | undefined): void {
    if (isIdentityLocalUploadDisabled()) {
      throw new BadRequestException(
        'Local Identity uploads are disabled. Use Sumsub for KYC verification.',
      );
    }
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
        'Invalid file: not a valid JPEG, PNG, or WebP image (magic bytes check failed).',
      );
    }
    // Trust magic-byte detection only. Camera/gallery may send wrong or no Content-Type;
    // we ignore claimed mimetype and accept any file whose content is valid JPEG/PNG/WebP.
  }

  private mapSumsubEventToKycStatus(params: {
    eventType?: string;
    reviewStatus?: string;
    reviewAnswer?: string;
  }): 'APPROVED' | 'REJECTED' | 'PENDING' {
    const eventType = (params.eventType || '').toLowerCase();
    const reviewStatus = (params.reviewStatus || '').toLowerCase();
    const reviewAnswer = (params.reviewAnswer || '').toUpperCase();

    // Final decision from Sumsub review result
    if (reviewAnswer === 'GREEN') return 'APPROVED';
    if (reviewAnswer === 'RED') return 'REJECTED';

    // Completed workflows without explicit reviewAnswer are considered finalized
    if (reviewStatus === 'completed') {
      if (
        eventType.includes('workflowfailed') ||
        eventType.includes('deactivated') ||
        eventType.includes('deleted')
      ) {
        return 'REJECTED';
      }
      return 'APPROVED';
    }

    // In-progress / waiting states remain pending
    if (
      reviewStatus === 'pending' ||
      reviewStatus === 'init' ||
      reviewStatus === 'onhold' ||
      reviewStatus === 'awaitinguser' ||
      reviewStatus === 'awaitingservice'
    ) {
      return 'PENDING';
    }

    return 'PENDING';
  }

  private extractUserIdFromExternalId(externalUserId?: string): string | null {
    if (!externalUserId) return null;
    const parts = externalUserId.split('_');
    return parts.length > 1 ? parts[parts.length - 1] : externalUserId;
  }

  private extractSourceFromExternalId(externalUserId?: string): string {
    if (!externalUserId) return 'PAY';
    const parts = externalUserId.split('_');
    if (parts.length <= 1) return 'PAY';
    const source = parts[0]?.toUpperCase();
    if (source === 'PAY' || source === 'GO' || source === 'STAYS') {
      return source;
    }
    return 'PAY';
  }

  private verifySumsubWebhookDigest(
    rawBody: Buffer | undefined,
    digestHeader?: string,
    digestAlgHeader?: string,
  ): void {
    if (!sumsubConfig.webhookSecret) {
      throw new BadRequestException('Sumsub webhook secret is not configured');
    }
    if (!rawBody || !digestHeader) {
      throw new BadRequestException('Missing Sumsub webhook signature');
    }

    const algorithmByHeader: Record<string, string> = {
      HMAC_SHA256_HEX: 'sha256',
      HMAC_SHA512_HEX: 'sha512',
      HMAC_SHA1_HEX: 'sha1',
    };
    const algorithm =
      algorithmByHeader[(digestAlgHeader || 'HMAC_SHA256_HEX').toUpperCase()];
    if (!algorithm) {
      throw new BadRequestException('Unsupported Sumsub webhook signature algorithm');
    }

    const expected = crypto
      .createHmac(algorithm, sumsubConfig.webhookSecret)
      .update(rawBody)
      .digest('hex');
    // Sumsub may send bare hex or a prefixed form (e.g. "sha256-hmac.<hex>").
    const providedRaw = digestHeader.trim();
    const provided = (
      providedRaw.includes('.')
        ? providedRaw.slice(providedRaw.lastIndexOf('.') + 1)
        : providedRaw
    ).toLowerCase();
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(provided, 'hex');
    if (
      !provided ||
      expectedBuffer.length !== providedBuffer.length ||
      expectedBuffer.length === 0 ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new BadRequestException('Invalid Sumsub webhook signature');
    }
  }

  private signSumsubRequest(
    method: string,
    pathName: string,
    body = '',
  ): Record<string, string> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', sumsubConfig.secretKey)
      .update(ts + method.toUpperCase() + pathName + body)
      .digest('hex');
    return {
      'X-App-Token': sumsubConfig.appToken,
      'X-App-Access-Ts': ts,
      'X-App-Access-Sig': signature,
    };
  }

  private async sumsubRequest<T>(
    method: string,
    pathName: string,
    body?: unknown,
  ): Promise<T> {
    if (!sumsubConfig.appToken || !sumsubConfig.secretKey) {
      throw new BadRequestException('Sumsub is not configured on the server');
    }

    const bodyString = body == null ? '' : JSON.stringify(body);
    const response = await fetch(`${sumsubConfig.baseUrl}${pathName}`, {
      method,
      headers: {
        ...(body == null ? {} : { 'Content-Type': 'application/json' }),
        ...this.signSumsubRequest(method, pathName, bodyString),
      },
      ...(body == null ? {} : { body: bodyString }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new BadRequestException(`Sumsub request failed: ${details}`);
    }
    return (await response.json()) as T;
  }

  /** Binary Sumsub download (document/selfie images). */
  private async sumsubRequestBinary(
    method: string,
    pathName: string,
  ): Promise<Buffer> {
    if (!sumsubConfig.appToken || !sumsubConfig.secretKey) {
      throw new BadRequestException('Sumsub is not configured on the server');
    }
    const response = await fetch(`${sumsubConfig.baseUrl}${pathName}`, {
      method,
      headers: this.signSumsubRequest(method, pathName, ''),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new BadRequestException(`Sumsub request failed: ${details}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /** Sumsub returns HTTP 404 or JSON body { code: 404, description: Applicant not found } depending on endpoint/version. */
  private isSumsubApplicantNotFound(details: string, httpStatus: number): boolean {
    if (httpStatus === 404) return true;
    try {
      const o = JSON.parse(details) as { code?: number; description?: string };
      if (o.code === 404) return true;
      const d = String(o.description || '').toLowerCase();
      if (d.includes('applicant not found')) return true;
    } catch {
      //
    }
    const low = details.toLowerCase();
    return (
      httpStatus >= 400 &&
      low.includes('"code"') &&
      low.includes('404') &&
      low.includes('applicant')
    );
  }

  private pendingSumsubSyncResult(userId: string, source: string) {
    return {
      updated: false,
      userId,
      source,
      reviewStatus: null as string | null,
      reviewAnswer: null as string | null,
      status: 'PENDING' as const,
      kycProfileStatus: 'PENDING' as const,
      onboarding: deriveIdentityOnboardingState({
        kycProfileExists: true,
        kycStatus: 'PENDING',
      }),
    };
  }

  /** ISO-3166 alpha-2 from KYC document or nationality (user or profile). */
  private resolveIssuerCountryCode(
    kyc: KycProfile,
    user: User | null,
  ): string | null {
    const d = (kyc.document_country ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(d)) return d;
    const uNat = (user?.nationality ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(uNat)) return uNat;
    const kNat = (kyc.nationality ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(kNat)) return kNat;
    return null;
  }

  /**
   * When verification succeeds, assign BASIC if tier is still NONE (explicit BASIC/STANDARD/FULL unchanged).
   */
  private promoteTierBasicIfNone(kyc: KycProfile): void {
    const level = (kyc.level ?? 'NONE').trim().toUpperCase();
    if (!level || level === 'NONE') {
      kyc.level = 'BASIC';
    }
  }

  /** Normalize Sumsub `info.dob` / `fixedInfo.dob` to YYYY-MM-DD; never invent values. */
  private extractSumsubIsoDob(
    applicant: Record<string, unknown> | null | undefined,
  ): string | null {
    if (!applicant || typeof applicant !== 'object') return null;
    const info = applicant.info as Record<string, unknown> | undefined;
    const fixedInfo = applicant.fixedInfo as Record<string, unknown> | undefined;
    for (const raw of [info?.dob, fixedInfo?.dob, applicant.dob]) {
      if (typeof raw !== 'string') continue;
      const dob = raw.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
    }
    return null;
  }

  private normalizeIsoDob(value: string | null | undefined): string | null {
    if (value == null || typeof value !== 'string') return null;
    const dob = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null;
  }

  private normalizeCountryCode(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const v = value.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(v)) return v;
    // Sumsub commonly returns ISO-3166 alpha-3 (e.g. "MAR"); map the ones we serve.
    return SUMSUB_ALPHA3_TO_ALPHA2[v] ?? null;
  }

  /** Map Sumsub `idDocType` codes onto the app's document_type vocabulary. */
  private mapSumsubDocType(raw: unknown, country: string | null): string | null {
    if (typeof raw !== 'string') return null;
    const v = raw.trim().toUpperCase();
    if (!v) return null;
    switch (v) {
      case 'ID_CARD':
        // Moroccan national ID card is the CNIE in our product vocabulary.
        return country === 'MA' ? 'CNIE' : 'NATIONAL_ID';
      case 'PASSPORT':
        return 'PASSPORT';
      case 'DRIVERS':
      case 'DRIVERS_LICENSE':
      case 'DRIVING_LICENSE':
        return 'DRIVING_LICENSE';
      case 'RESIDENCE_PERMIT':
        return 'RESIDENCE_PERMIT';
      default:
        return v.slice(0, 50);
    }
  }

  /**
   * Extract verified identity fields from a Sumsub applicant payload.
   * Never invents values: every field is null unless the provider supplied it.
   * Checks `info` (verified/extracted), then `fixedInfo` (applicant-declared),
   * then the first identity document in `info.idDocs`.
   */
  extractSumsubIdentity(
    applicant: Record<string, unknown> | null | undefined,
  ): SumsubIdentityFields {
    const empty: SumsubIdentityFields = {
      dateOfBirth: null,
      fullName: null,
      nationality: null,
      documentType: null,
      documentCountry: null,
      documentNumber: null,
      documentValidUntil: null,
      email: null,
      phone: null,
      levelName: null,
      reviewStatus: null,
      reviewAnswer: null,
      attemptCnt: null,
      inspectionId: null,
    };
    if (!applicant || typeof applicant !== 'object') return empty;
    const info = (applicant.info as Record<string, unknown> | undefined) ?? undefined;
    const fixedInfo =
      (applicant.fixedInfo as Record<string, unknown> | undefined) ?? undefined;
    const review =
      (applicant.review as Record<string, unknown> | undefined) ?? undefined;
    const reviewResult =
      (review?.reviewResult as Record<string, unknown> | undefined) ?? undefined;
    const idDocs = Array.isArray(info?.idDocs)
      ? (info!.idDocs as Record<string, unknown>[])
      : [];
    const primaryDoc =
      idDocs.find((d) => typeof d?.idDocType === 'string' && d.idDocType !== 'SELFIE') ??
      null;

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const nameFrom = (src?: Record<string, unknown>) => {
      if (!src) return null;
      const parts = [src.firstName, src.middleName, src.lastName]
        .map((p) => str(p))
        .filter((p): p is string => Boolean(p));
      return parts.length > 0 ? parts.join(' ').slice(0, 200) : null;
    };

    const documentCountry =
      this.normalizeCountryCode(primaryDoc?.country) ??
      this.normalizeCountryCode(info?.country) ??
      this.normalizeCountryCode(fixedInfo?.country);
    const nationality =
      this.normalizeCountryCode(info?.nationality) ??
      this.normalizeCountryCode(fixedInfo?.nationality) ??
      documentCountry;

    const attemptRaw = review?.attemptCnt;
    const attemptCnt =
      typeof attemptRaw === 'number' && Number.isFinite(attemptRaw)
        ? Math.trunc(attemptRaw)
        : null;

    return {
      dateOfBirth: this.extractSumsubIsoDob(applicant),
      fullName: nameFrom(info) ?? nameFrom(fixedInfo) ?? nameFrom(primaryDoc ?? undefined),
      nationality,
      documentType: this.mapSumsubDocType(primaryDoc?.idDocType, documentCountry),
      documentCountry,
      documentNumber: str(primaryDoc?.number)?.slice(0, 64) ?? null,
      // Expiry only — never use issuedDate (issue ≠ valid-until).
      documentValidUntil: this.normalizeIsoDob(str(primaryDoc?.validUntil)),
      email: str(applicant.email)?.slice(0, 150) ?? str(info?.email)?.slice(0, 150) ?? null,
      phone: str(applicant.phone)?.slice(0, 30) ?? null,
      levelName:
        str(review?.levelName)?.slice(0, 120) ??
        str(applicant.levelName)?.slice(0, 120) ??
        null,
      reviewStatus: str(review?.reviewStatus)?.slice(0, 40) ?? null,
      reviewAnswer: str(reviewResult?.reviewAnswer)?.slice(0, 20)?.toUpperCase() ?? null,
      attemptCnt,
      inspectionId: str(applicant.inspectionId)?.slice(0, 64) ?? null,
    };
  }

  private kycIdentityIsComplete(kyc: KycProfile): boolean {
    return Boolean(
      this.normalizeIsoDob(kyc.date_of_birth) &&
        kyc.full_name?.trim() &&
        kyc.nationality?.trim() &&
        kyc.document_type?.trim() &&
        kyc.document_country?.trim() &&
        kyc.national_id_number_extracted?.trim(),
    );
  }

  /**
   * Resolve provider identity: prefer the applicant payload we already have;
   * otherwise fetch the Sumsub applicant once when KYC identity is incomplete
   * and the payload has no identity PII.
   * Webhook review meta (levelName / inspectionId / review*) must not count as
   * identity — those alone used to skip the applicant GET.
   * Failures must not block KYC approval/rejection updates.
   */
  private async resolveSumsubIdentity(params: {
    providerApplicant?: Record<string, unknown> | null;
    providerDateOfBirth?: string | null;
    applicantId?: string | null;
    kyc: KycProfile;
  }): Promise<SumsubIdentityFields> {
    const fromPayload = this.extractSumsubIdentity(params.providerApplicant);
    if (!fromPayload.dateOfBirth) {
      fromPayload.dateOfBirth = this.normalizeIsoDob(params.providerDateOfBirth ?? null);
    }
    if (this.kycIdentityIsComplete(params.kyc)) return fromPayload;

    const hasIdentityPii = Boolean(
      fromPayload.dateOfBirth ||
        fromPayload.fullName ||
        fromPayload.nationality ||
        fromPayload.documentType ||
        fromPayload.documentCountry ||
        fromPayload.documentNumber ||
        fromPayload.documentValidUntil ||
        fromPayload.email ||
        fromPayload.phone,
    );
    if (hasIdentityPii) return fromPayload;

    const applicantId = (params.applicantId ?? '').trim();
    if (!applicantId) return fromPayload;

    try {
      const applicant = await this.sumsubRequest<Record<string, unknown>>(
        'GET',
        `/resources/applicants/${encodeURIComponent(applicantId)}/one`,
      );
      const fromApi = this.extractSumsubIdentity(applicant);
      // Prefer API identity PII; keep webhook root meta when richer.
      return {
        dateOfBirth: fromApi.dateOfBirth ?? fromPayload.dateOfBirth,
        fullName: fromApi.fullName ?? fromPayload.fullName,
        nationality: fromApi.nationality ?? fromPayload.nationality,
        documentType: fromApi.documentType ?? fromPayload.documentType,
        documentCountry: fromApi.documentCountry ?? fromPayload.documentCountry,
        documentNumber: fromApi.documentNumber ?? fromPayload.documentNumber,
        documentValidUntil: fromApi.documentValidUntil ?? fromPayload.documentValidUntil,
        email: fromApi.email ?? fromPayload.email,
        phone: fromApi.phone ?? fromPayload.phone,
        levelName: fromPayload.levelName ?? fromApi.levelName,
        reviewStatus: fromPayload.reviewStatus ?? fromApi.reviewStatus,
        reviewAnswer: fromPayload.reviewAnswer ?? fromApi.reviewAnswer,
        attemptCnt: fromPayload.attemptCnt ?? fromApi.attemptCnt,
        inspectionId: fromPayload.inspectionId ?? fromApi.inspectionId,
      };
    } catch {
      safeLogger.debug('Sumsub applicant identity fetch skipped', {
        hasApplicantId: true,
      });
      return fromPayload;
    }
  }

  /** Fill only empty KYC identity columns from provider data (form/verified data is never clobbered). */
  private applyProviderIdentityToKyc(kyc: KycProfile, id: SumsubIdentityFields): void {
    if (id.dateOfBirth && !this.normalizeIsoDob(kyc.date_of_birth)) {
      kyc.date_of_birth = id.dateOfBirth;
    }
    if (id.fullName && !kyc.full_name?.trim()) kyc.full_name = id.fullName;
    if (id.nationality && !kyc.nationality?.trim()) kyc.nationality = id.nationality;
    if (id.documentType && !kyc.document_type?.trim()) kyc.document_type = id.documentType;
    if (id.documentCountry && !kyc.document_country?.trim()) {
      kyc.document_country = id.documentCountry;
    }
    if (id.documentNumber && !kyc.national_id_number_extracted?.trim()) {
      kyc.national_id_number_extracted = id.documentNumber;
      if (!kyc.national_id_number_hash) {
        kyc.national_id_number_hash = this.hashNationalId(id.documentNumber);
      }
    }
    if (id.documentValidUntil && !this.normalizeIsoDob(kyc.document_valid_until)) {
      kyc.document_valid_until = id.documentValidUntil;
    }
    if (id.email && !kyc.email?.trim()) kyc.email = id.email;
    // Phone lives on the user row (auth identity) — applied in applySumsubReviewStatus.
  }

  /** Always refresh provider review meta from the latest applicant payload. */
  private applyProviderMetaToKyc(kyc: KycProfile, id: SumsubIdentityFields): void {
    if (id.levelName) kyc.provider_level_name = id.levelName;
    if (id.reviewStatus) kyc.provider_review_status = id.reviewStatus;
    if (id.reviewAnswer) kyc.provider_review_answer = id.reviewAnswer;
    if (id.attemptCnt != null) kyc.provider_attempt_cnt = id.attemptCnt;
    if (id.inspectionId) kyc.provider_inspection_id = id.inspectionId;
  }

  private async applySumsubReviewStatus(params: {
    userId: string;
    source: string;
    applicantId?: string | null;
    externalUserId?: string | null;
    eventType?: string | null;
    reviewStatus?: string | null;
    reviewResult?: Record<string, unknown> | null;
    /** Pre-extracted Sumsub ISO DOB from applicant sync (optional). */
    providerDateOfBirth?: string | null;
    /** Raw Sumsub applicant object (webhook `applicant` / sync GET) for identity backfill. */
    providerApplicant?: Record<string, unknown> | null;
  }) {
    const reviewAnswer = params.reviewResult?.reviewAnswer as string | undefined;
    const rejectLabels = params.reviewResult?.rejectLabels as unknown;
    let kyc = await this.kycRepository.findOne({
      where: { user_id: params.userId },
    });
    if (!kyc) {
      kyc = this.kycRepository.create({
        user_id: params.userId,
        provider: 'SUMSUB',
        source: params.source,
      });
    }

    const userKycStatus = this.mapSumsubEventToKycStatus({
      eventType: params.eventType ?? undefined,
      reviewStatus: params.reviewStatus ?? undefined,
      reviewAnswer,
    });

    kyc.provider = 'SUMSUB';
    kyc.source = kyc.source || params.source;
    kyc.reference =
      params.applicantId ?? params.externalUserId ?? `${kyc.source ?? 'PAY'}_${params.userId}`;
    kyc.last_webhook_event_type =
      (params.eventType ?? 'sumsubStatusSync').slice(0, 100) || null;
    kyc.last_webhook_received_at = new Date();

    const providerIdentity = await this.resolveSumsubIdentity({
      providerApplicant: params.providerApplicant,
      providerDateOfBirth: params.providerDateOfBirth,
      applicantId: params.applicantId,
      kyc,
    });
    this.applyProviderIdentityToKyc(kyc, providerIdentity);
    this.applyProviderMetaToKyc(kyc, providerIdentity);

    const user = await this.userRepository.findOne({ where: { id: params.userId } });

    let profileStatus =
      userKycStatus === 'APPROVED' ? 'VERIFIED' : userKycStatus;
    let userRowKycStatus: string = userKycStatus;

    if (userKycStatus === 'APPROVED') {
      const country = this.resolveIssuerCountryCode(kyc, user);
      if (!country) {
        profileStatus = 'UNDER_REVIEW';
        userRowKycStatus = 'UNDER_REVIEW';
      } else {
        if (!kyc.document_country?.trim()) {
          kyc.document_country = country;
        }
        this.promoteTierBasicIfNone(kyc);
        profileStatus = 'VERIFIED';
        userRowKycStatus = 'VERIFIED';
      }
    }

    kyc.status = profileStatus;

    if (
      params.reviewStatus?.toLowerCase() === 'completed' ||
      reviewAnswer === 'GREEN' ||
      reviewAnswer === 'RED'
    ) {
      kyc.reviewed_at = new Date();
      kyc.reviewed_by = 'sumsub';
    }
    if (userKycStatus === 'REJECTED') {
      kyc.rejection_reason = JSON.stringify(rejectLabels ?? params.reviewResult ?? {}).slice(0, 2000);
    } else if (userKycStatus === 'APPROVED') {
      kyc.rejection_reason = null;
    }
    await this.kycRepository.save(kyc);

    if (user) {
      user.kyc_status = userRowKycStatus;
      // Prefer KYC form data if the user shell is still missing PII
      if (!user.full_name?.trim() && kyc.full_name?.trim()) {
        user.full_name = kyc.full_name.trim().slice(0, 100);
      }
      if (!user.email?.trim() && kyc.email?.trim()) {
        user.email = kyc.email.trim().slice(0, 150);
      }
      if (!user.phone_number?.trim() && providerIdentity.phone) {
        const norm = tryNormalizePhoneNumber(providerIdentity.phone);
        if (norm) user.phone_number = norm.slice(0, 30);
      }
      if (!user.date_of_birth && kyc.date_of_birth?.trim()) {
        const dob = kyc.date_of_birth.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
          user.date_of_birth = new Date(`${dob}T00:00:00.000Z`);
        }
      }
      if (!user.nationality?.trim() && kyc.nationality?.trim()) {
        user.nationality = kyc.nationality.trim().slice(0, 10);
      }
      if (
        userRowKycStatus === 'VERIFIED' &&
        !user.profile_locked_at
      ) {
        user.profile_locked_at = new Date();
      }
      await this.userRepository.save(user);

      if (
        user.unified_identity_id &&
        (userRowKycStatus === 'VERIFIED' || userRowKycStatus === 'APPROVED')
      ) {
        const dobForIdentity =
          this.normalizeIsoDob(kyc.date_of_birth) ??
          (user.date_of_birth
            ? user.date_of_birth instanceof Date
              ? user.date_of_birth.toISOString().slice(0, 10)
              : this.normalizeIsoDob(String(user.date_of_birth))
            : null);
        await this.userRepository.manager.query(
          `UPDATE unified_identities
           SET identity_verified = true,
               identity_verification_status = 'APPROVED',
               full_name = COALESCE(NULLIF(BTRIM(COALESCE(full_name, '')), ''), $2),
               email = COALESCE(NULLIF(BTRIM(COALESCE(email, '')), ''), $3),
               date_of_birth = COALESCE(date_of_birth, $4::date),
               updated_at = NOW()
           WHERE id = $1`,
          [
            user.unified_identity_id,
            user.full_name ?? null,
            user.email ?? null,
            dobForIdentity,
          ],
        );
      }
    }

    return {
      updated: true,
      userId: params.userId,
      source: kyc.source,
      reviewStatus: params.reviewStatus ?? null,
      reviewAnswer: reviewAnswer ?? null,
      status: userRowKycStatus,
      kycProfileStatus: kyc.status,
      onboarding: deriveIdentityOnboardingState({
        kycProfileExists: true,
        kycStatus: kyc.status,
      }),
    };
  }

  async createSumsubSdkToken(userId: string, source = 'PAY') {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const externalUserId = `${source}_${userId}`;
    const payload = {
      userId: externalUserId,
      levelName: sumsubConfig.levelName,
      ttlInSecs: sumsubConfig.tokenTtlSeconds,
      applicantIdentifiers: {
        phone: user.phone_number,
        ...(user.email ? { email: user.email } : {}),
      },
    };
    const pathName = '/resources/accessTokens/sdk';
    const tokenData = await this.sumsubRequest<{
      token?: string;
      userId?: string;
      applicantId?: string;
    }>('POST', pathName, payload);

    let kyc = await this.kycRepository.findOne({ where: { user_id: userId } });
    if (!kyc) {
      kyc = this.kycRepository.create({ user_id: userId });
    }
    kyc.provider = 'SUMSUB';
    kyc.source = source;
    kyc.reference = tokenData.userId ?? externalUserId;
    kyc.status = kyc.status || 'PENDING';

    // Token minting must never downgrade an already-approved verification.
    const protectedStatuses = new Set(['APPROVED', 'VERIFIED']);
    const userStatus = (user.kyc_status || '').toUpperCase();
    const profileStatus = (kyc.status || '').toUpperCase();
    if (
      !protectedStatuses.has(userStatus) &&
      !protectedStatuses.has(profileStatus)
    ) {
      user.kyc_status = 'PENDING';
    }

    await this.kycRepository.save(kyc);
    await this.userRepository.save(user);

    return {
      token: tokenData.token,
      externalUserId,
      applicantId: tokenData.applicantId ?? null,
      levelName: sumsubConfig.levelName,
      ttlInSecs: sumsubConfig.tokenTtlSeconds,
    };
  }

  async syncSumsubStatus(userId: string, source = 'PAY') {
    const externalUserId = `${source}_${userId}`;
    const pathName = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;

    if (!sumsubConfig.appToken || !sumsubConfig.secretKey) {
      throw new BadRequestException('Sumsub is not configured on the server');
    }

    const signedHeaders = this.signSumsubRequest('GET', pathName, '');
    const applicantRes = await fetch(`${sumsubConfig.baseUrl}${pathName}`, {
      method: 'GET',
      headers: signedHeaders,
    });
    const applicantText = await applicantRes.text();

    if (!applicantRes.ok) {
      if (this.isSumsubApplicantNotFound(applicantText, applicantRes.status)) {
        return this.pendingSumsubSyncResult(userId, source);
      }
      throw new BadRequestException(`Sumsub request failed: ${applicantText}`);
    }

    let applicant: Record<string, unknown>;
    try {
      applicant = JSON.parse(applicantText) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Sumsub applicant response invalid JSON');
    }

    const applicantId =
      typeof applicant.id === 'string' ? applicant.id : undefined;
    if (!applicantId) {
      return this.pendingSumsubSyncResult(userId, source);
    }

    const status = await this.sumsubRequest<{
      reviewStatus?: string;
      reviewResult?: Record<string, unknown>;
    }>('GET', `/resources/applicants/${applicantId}/status`);

    return this.applySumsubReviewStatus({
      userId,
      source,
      applicantId,
      externalUserId:
        (typeof applicant.externalUserId === 'string'
          ? applicant.externalUserId
          : null) ?? externalUserId,
      eventType: 'sumsubStatusSync',
      reviewStatus: status.reviewStatus ?? null,
      reviewResult: status.reviewResult ?? null,
      providerDateOfBirth: this.extractSumsubIsoDob(applicant),
      providerApplicant: applicant,
    });
  }

  /**
   * Full dossier sync for admin Re-sync: status + empty-only PII fill + provider
   * meta refresh + document/selfie download into uploads/kyc.
   */
  async syncSumsubDossier(userId: string, source = 'PAY') {
    const externalUserId = `${source}_${userId}`;
    const pathName = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;

    if (!sumsubConfig.appToken || !sumsubConfig.secretKey) {
      throw new BadRequestException('Sumsub is not configured on the server');
    }

    const signedHeaders = this.signSumsubRequest('GET', pathName, '');
    const applicantRes = await fetch(`${sumsubConfig.baseUrl}${pathName}`, {
      method: 'GET',
      headers: signedHeaders,
    });
    const applicantText = await applicantRes.text();

    if (!applicantRes.ok) {
      if (this.isSumsubApplicantNotFound(applicantText, applicantRes.status)) {
        return this.pendingSumsubSyncResult(userId, source);
      }
      throw new BadRequestException(`Sumsub request failed: ${applicantText}`);
    }

    let applicant: Record<string, unknown>;
    try {
      applicant = JSON.parse(applicantText) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Sumsub applicant response invalid JSON');
    }

    const applicantId =
      typeof applicant.id === 'string' ? applicant.id : undefined;
    if (!applicantId) {
      return this.pendingSumsubSyncResult(userId, source);
    }

    const status = await this.sumsubRequest<{
      reviewStatus?: string;
      reviewResult?: Record<string, unknown>;
    }>('GET', `/resources/applicants/${applicantId}/status`);

    const result = await this.applySumsubReviewStatus({
      userId,
      source,
      applicantId,
      externalUserId:
        (typeof applicant.externalUserId === 'string'
          ? applicant.externalUserId
          : null) ?? externalUserId,
      eventType: 'sumsubDossierSync',
      reviewStatus: status.reviewStatus ?? null,
      reviewResult: status.reviewResult ?? null,
      providerDateOfBirth: this.extractSumsubIsoDob(applicant),
      providerApplicant: applicant,
    });

    await this.persistSumsubDossierArtifacts({
      userId,
      applicantId,
      applicant,
      reviewStatus: status.reviewStatus ?? null,
      reviewResult: status.reviewResult ?? null,
    });

    return result;
  }

  /** Events that should pull docsStatus + images into Nexa (same as admin Re-sync media path). */
  private shouldSyncDossierMediaOnWebhook(eventType?: string | null): boolean {
    const t = (eventType || '').toLowerCase();
    return (
      t === 'applicantreviewed' ||
      t === 'applicantpending' ||
      t === 'applicantpersonalinfochanged' ||
      t === 'applicantworkflowcompleted' ||
      t === 'applicantworkflowfailed'
    );
  }

  /**
   * Download IDENTITY/SELFIE images + refresh provider_snapshot / provider_synced_at.
   * Shared by admin Re-sync and Sumsub webhooks. Never throws for missing docsStatus.
   */
  private async persistSumsubDossierArtifacts(params: {
    userId: string;
    applicantId: string;
    applicant?: Record<string, unknown> | null;
    reviewStatus?: string | null;
    reviewResult?: Record<string, unknown> | null;
  }): Promise<void> {
    const { userId, applicantId } = params;
    let applicant = params.applicant ?? null;

    if (!applicant || typeof applicant !== 'object' || !applicant.info) {
      try {
        applicant = await this.sumsubRequest<Record<string, unknown>>(
          'GET',
          `/resources/applicants/${encodeURIComponent(applicantId)}/one`,
        );
      } catch (err) {
        safeLogger.debug('Sumsub applicant fetch for dossier skipped', {
          err: String((err as Error)?.message ?? err),
        });
      }
    }

    let docsStatus: Record<string, unknown> | null = null;
    try {
      docsStatus = await this.sumsubRequest<Record<string, unknown>>(
        'GET',
        `/resources/applicants/${encodeURIComponent(applicantId)}/requiredIdDocsStatus`,
      );
    } catch (err) {
      safeLogger.debug('Sumsub requiredIdDocsStatus fetch skipped', {
        err: String((err as Error)?.message ?? err),
      });
    }

    const kyc = await this.kycRepository.findOne({ where: { user_id: userId } });
    if (!kyc) return;

    if (docsStatus) {
      await this.applyDocsStatusAndMedia(kyc, applicantId, docsStatus);
    }

    const status = {
      reviewStatus: params.reviewStatus ?? undefined,
      reviewResult: params.reviewResult ?? undefined,
    };
    kyc.provider_snapshot = this.buildProviderSnapshot(
      applicant ?? { id: applicantId },
      docsStatus,
      status,
    );
    kyc.provider_synced_at = new Date();
    if (/^[a-f0-9]{24}$/i.test(applicantId)) {
      kyc.reference = applicantId;
    }
    await this.kycRepository.save(kyc);
  }

  private buildProviderSnapshot(
    applicant: Record<string, unknown>,
    docsStatus: Record<string, unknown> | null,
    status: { reviewStatus?: string; reviewResult?: Record<string, unknown> },
  ): Record<string, unknown> {
    const review = (applicant.review as Record<string, unknown> | undefined) ?? {};
    const info = (applicant.info as Record<string, unknown> | undefined) ?? {};
    const idDocs = Array.isArray(info.idDocs) ? info.idDocs : [];
    const trimDoc = (d: unknown) => {
      if (!d || typeof d !== 'object') return null;
      const doc = d as Record<string, unknown>;
      return {
        idDocType: doc.idDocType ?? null,
        country: doc.country ?? null,
        validUntil: doc.validUntil ?? null,
        // number intentionally omitted from snapshot (PII); lives encrypted on profile
      };
    };
    const trimSet = (key: string) => {
      const set = docsStatus?.[key];
      if (!set || typeof set !== 'object') return null;
      const s = set as Record<string, unknown>;
      const rr = (s.reviewResult as Record<string, unknown> | undefined) ?? {};
      return {
        idDocType: s.idDocType ?? null,
        country: s.country ?? null,
        reviewAnswer: rr.reviewAnswer ?? null,
        imageIds: Array.isArray(s.imageIds) ? s.imageIds.slice(0, 6) : [],
      };
    };
    return {
      applicantId: applicant.id ?? null,
      externalUserId: applicant.externalUserId ?? null,
      inspectionId: applicant.inspectionId ?? null,
      createdAt: applicant.createdAt ?? null,
      levelName: review.levelName ?? null,
      reviewStatus: status.reviewStatus ?? review.reviewStatus ?? null,
      reviewAnswer:
        (status.reviewResult?.reviewAnswer as string | undefined) ??
        ((review.reviewResult as Record<string, unknown> | undefined)?.reviewAnswer as
          | string
          | undefined) ??
        null,
      attemptCnt: review.attemptCnt ?? null,
      idDocs: idDocs.slice(0, 5).map(trimDoc).filter(Boolean),
      docsStatus: docsStatus
        ? {
            IDENTITY: trimSet('IDENTITY'),
            SELFIE: trimSet('SELFIE'),
            PHONE_VERIFICATION: trimSet('PHONE_VERIFICATION'),
          }
        : null,
      syncedAt: new Date().toISOString(),
    };
  }

  private async applyDocsStatusAndMedia(
    kyc: KycProfile,
    applicantId: string,
    docsStatus: Record<string, unknown>,
  ): Promise<void> {
    const identity = docsStatus.IDENTITY as Record<string, unknown> | undefined;
    const selfie = docsStatus.SELFIE as Record<string, unknown> | undefined;
    const phone = docsStatus.PHONE_VERIFICATION as Record<string, unknown> | undefined;

    const answer = (set?: Record<string, unknown>) =>
      String(
        ((set?.reviewResult as Record<string, unknown> | undefined)?.reviewAnswer as
          | string
          | undefined) ?? '',
      ).toUpperCase() === 'GREEN';

    const docs = {
      ...(kyc.documents ?? {}),
      id_document: answer(identity) || Boolean(kyc.documents?.id_document),
      selfie: answer(selfie) || Boolean(kyc.documents?.selfie),
      liveness:
        answer(selfie) || Boolean(kyc.documents?.liveness),
      phone: answer(phone) || Boolean((kyc.documents as { phone?: boolean } | null)?.phone),
    };
    kyc.documents = docs;

    const identityIds = Array.isArray(identity?.imageIds)
      ? (identity!.imageIds as unknown[]).filter((x) => x != null).map(String)
      : [];
    const selfieIds = Array.isArray(selfie?.imageIds)
      ? (selfie!.imageIds as unknown[]).filter((x) => x != null).map(String)
      : [];

    if (identityIds[0]) {
      const rel = await this.persistProviderImage(
        kyc.user_id,
        applicantId,
        identityIds[0],
        'sumsub_doc_front',
      );
      if (rel) {
        kyc.document_front_url = rel;
        kyc.id_document_url = rel;
      }
    }
    if (identityIds[1]) {
      const rel = await this.persistProviderImage(
        kyc.user_id,
        applicantId,
        identityIds[1],
        'sumsub_doc_back',
      );
      if (rel) kyc.document_back_url = rel;
    }
    if (selfieIds[0]) {
      const rel = await this.persistProviderImage(
        kyc.user_id,
        applicantId,
        selfieIds[0],
        'sumsub_selfie',
      );
      if (rel) kyc.selfie_url = rel;
    }
  }

  private async persistProviderImage(
    userId: string,
    applicantId: string,
    imageId: string,
    basename: string,
  ): Promise<string | null> {
    try {
      assertIdentityProviderMediaSyncAllowed();
      const buf = await this.sumsubRequestBinary(
        'GET',
        `/resources/applicants/${encodeURIComponent(applicantId)}/resources/${encodeURIComponent(imageId)}`,
      );
      if (!buf?.length) return null;
      const detected = detectImageType(buf);
      const ext = detected ? this.getExtensionFromDetected(detected) : '.jpg';
      const filename = `${basename}${ext}`;
      this.validateFilename(filename);
      const relativePath = `${userId}/${filename}`.replace(/\\/g, '/');
      const dir = path.join(UPLOAD_DIR, userId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(UPLOAD_DIR, userId, filename), buf);
      return relativePath;
    } catch (err) {
      safeLogger.debug('Sumsub image persist skipped', {
        basename,
        err: String((err as Error)?.message ?? err),
      });
      return null;
    }
  }

  async processSumsubWebhook(
    payload: Record<string, unknown>,
    rawBody?: Buffer,
    digestHeader?: string,
    digestAlgHeader?: string,
  ) {
    this.verifySumsubWebhookDigest(rawBody, digestHeader, digestAlgHeader);

    const externalUserId =
      (payload.externalUserId as string | undefined) ||
      ((payload.applicant as Record<string, unknown> | undefined)?.externalUserId as string | undefined);
    const eventType = payload.type as string | undefined;
    const reviewStatus = payload.reviewStatus as string | undefined;
    const applicantId = payload.applicantId as string | undefined;
    const applicantPayload =
      (payload.applicant as Record<string, unknown> | undefined) ?? null;
    const reviewResult =
      (payload.reviewResult as Record<string, unknown> | undefined) ||
      ((payload.review as Record<string, unknown> | undefined)?.reviewResult as Record<string, unknown> | undefined);

    // Sumsub puts levelName / inspectionId on the webhook root, not always under `applicant`.
    const providerApplicant: Record<string, unknown> | null = {
      ...(applicantPayload ?? {}),
      ...(typeof payload.levelName === 'string'
        ? { levelName: payload.levelName }
        : {}),
      ...(typeof payload.inspectionId === 'string'
        ? { inspectionId: payload.inspectionId }
        : {}),
      ...(typeof payload.reviewStatus === 'string' || reviewResult
        ? {
            review: {
              ...((applicantPayload?.review as Record<string, unknown> | undefined) ?? {}),
              ...(typeof payload.levelName === 'string'
                ? { levelName: payload.levelName }
                : {}),
              ...(typeof payload.reviewStatus === 'string'
                ? { reviewStatus: payload.reviewStatus }
                : {}),
              ...(reviewResult ? { reviewResult } : {}),
            },
          }
        : {}),
    };
    const hasProviderApplicantKeys = Object.keys(providerApplicant).length > 0;

    const userId = this.extractUserIdFromExternalId(externalUserId);
    if (!userId) {
      return { received: true, updated: false, reason: 'missing external user id' };
    }

    const source = this.extractSourceFromExternalId(externalUserId);
    let result: Record<string, unknown> = { updated: false };
    try {
      result = await this.applySumsubReviewStatus({
        userId,
        source,
        applicantId,
        externalUserId,
        eventType,
        reviewStatus,
        reviewResult: reviewResult ?? null,
        providerDateOfBirth: this.extractSumsubIsoDob(
          hasProviderApplicantKeys ? providerApplicant : null,
        ),
        providerApplicant: hasProviderApplicantKeys ? providerApplicant : null,
      });
    } catch (err) {
      // Ack webhook (200) so Sumsub does not retry forever on persistent failures;
      // admin Re-sync / next event can repair. Digest already verified above.
      safeLogger.error('Sumsub webhook status apply failed', {
        eventType: eventType ?? null,
        err: String((err as Error)?.message ?? err),
      });
      result = { updated: false, reason: 'status_apply_failed' };
    }

    // Same dossier/media path as admin Re-sync — so the drawer is populated without a click
    // once Sumsub can reach this webhook (sandbox/ngrok or production URL).
    if (
      applicantId &&
      this.shouldSyncDossierMediaOnWebhook(eventType)
    ) {
      try {
        await this.persistSumsubDossierArtifacts({
          userId,
          applicantId,
          applicant: hasProviderApplicantKeys ? providerApplicant : applicantPayload,
          reviewStatus: reviewStatus ?? null,
          reviewResult: reviewResult ?? null,
        });
      } catch (err) {
        safeLogger.warn('Sumsub webhook dossier/media sync failed', {
          eventType: eventType ?? null,
          err: String((err as Error)?.message ?? err),
        });
      }
    }

    return { received: true, eventType: eventType ?? null, ...result };
  }

  /** Server-generated extension from detected type only (never trust client filename). */
  private getExtensionFromDetected(detected: AllowedImageType): string {
    if (detected === 'png') return '.png';
    if (detected === 'webp') return '.webp';
    return '.jpg';
  }

  /** Reject path traversal and invalid chars. Filename only (no slashes). */
  validateFilename(filename: string): void {
    if (!filename || typeof filename !== 'string') {
      throw new BadRequestException('Invalid filename');
    }
    const dangerous = /\.\.|\/|\\|%2f|%5c/i.test(filename);
    if (dangerous || !FILENAME_ALLOWLIST.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
  }

  /** One-way hash for Moroccan CNIE number. Never store raw. */
  private hashNationalId(plain: string): string {
    return crypto
      .createHmac('sha256', appConfig.kycHashPepper)
      .update(plain.trim())
      .digest('hex');
  }

  /**
   * Resolve and validate path under UPLOAD_DIR. Returns absolute filesystem path.
   * Caller must enforce auth (same user or admin).
   */
  async getKycFilePath(userId: string, filename: string): Promise<string> {
    this.validateFilename(filename);
    const relativePath = `${userId}/${filename}`;
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      throw new BadRequestException('Invalid path');
    }
    const fullPath = path.join(UPLOAD_DIR, relativePath);
    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException('File not found');
    }
    return fullPath;
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File | undefined,
    options: DocumentUploadOptions = {},
  ): Promise<{ url: string }> {
    this.validateImageFile(file);
    const side = options.side ?? 'front';
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const detected = detectImageType(file!.buffer);
    const ext = this.getExtensionFromDetected(detected!);
    const filename =
      side === 'back' ? `document_back${ext}` : `document_front${ext}`;
    const relativePath = `${userId}/${filename}`.replace(/\\/g, '/');
    const dir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, userId, filename), file!.buffer);

    let kyc = await this.kycRepository.findOne({ where: { user_id: userId } });
    if (!kyc) {
      kyc = this.kycRepository.create({ user_id: userId });
      kyc.status = 'PENDING';
      kyc.documents = { id_document: false, selfie: false, liveness: false };
    }
    if (side === 'front') {
      kyc.document_front_url = relativePath;
      kyc.id_document_url = relativePath;
    } else {
      kyc.document_back_url = relativePath;
    }
    if (options.document_type) kyc.document_type = options.document_type;
    if (options.document_country)
      kyc.document_country = options.document_country;
    if (options.national_id_number_extracted) {
      kyc.national_id_number_extracted = options.national_id_number_extracted
        .trim()
        .slice(0, 64);
    }
    kyc.documents = {
      ...kyc.documents,
      id_document: true,
      selfie: kyc.documents?.selfie ?? false,
      liveness: kyc.documents?.liveness ?? false,
    };
    kyc.status = 'PENDING';
    user.kyc_status = 'PENDING';
    await this.userRepository.save(user);
    await this.kycRepository.save(kyc);

    const url =
      side === 'front' ? kyc.document_front_url! : kyc.document_back_url!;
    return { url };
  }

  /** Legacy: single document upload treated as front. */
  async uploadIdDocument(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    return this.uploadDocument(userId, file, { side: 'front' });
  }

  async uploadSelfie(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    this.validateImageFile(file);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const detected = detectImageType(file!.buffer);
    const ext = this.getExtensionFromDetected(detected!);
    const filename = `selfie${ext}`;
    const relativePath = path.join(userId, filename);
    const dir = path.join(UPLOAD_DIR, userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, relativePath), file!.buffer);

    let kyc = await this.kycRepository.findOne({ where: { user_id: userId } });
    if (!kyc) {
      kyc = this.kycRepository.create({ user_id: userId });
      kyc.status = 'PENDING';
      kyc.documents = { id_document: false, selfie: false, liveness: false };
    }
    kyc.selfie_url = relativePath.replace(/\\/g, '/');
    kyc.documents = {
      ...kyc.documents,
      id_document: kyc.documents?.id_document ?? false,
      selfie: true,
      liveness: kyc.documents?.liveness ?? false,
    };
    user.kyc_status = 'PENDING';
    await this.userRepository.save(user);
    await this.kycRepository.save(kyc);

    return { url: kyc.selfie_url };
  }

  async submitKyc(userId: string, payload: SubmitKycDto) {
    safeLogger.debug('KYC submit received', {
      userId,
      hasFullName: !!payload.full_name,
      hasDob: !!payload.date_of_birth,
      hasNationality: !!payload.nationality,
      hasNationalId: !!payload.national_id_number,
    });

    // Defensive lookup by ID (JWT source of truth) instead of phone_number
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      safeLogger.error('KYC submit user not found', undefined, { userId });
      throw new NotFoundException('User not found');
    }

    safeLogger.debug('KYC user resolved');

    const existing = await this.kycRepository.findOne({
      where: { user_id: user.id },
    });

    const kyc = existing ?? this.kycRepository.create({ user_id: user.id });
    kyc.status = 'PENDING';
    kyc.documents = payload.documents ??
      kyc.documents ?? { id_document: false, selfie: false, liveness: false };
    if (payload.full_name != null && payload.full_name !== '') {
      kyc.full_name = payload.full_name.trim().slice(0, 200);
    }
    if (payload.date_of_birth != null && payload.date_of_birth !== '') {
      kyc.date_of_birth = payload.date_of_birth.trim().slice(0, 16);
    }
    if (payload.nationality != null && payload.nationality !== '') {
      kyc.nationality = payload.nationality.trim().slice(0, 10);
    }
    const documentCountry = this.resolveDocumentCountry(payload);
    kyc.document_country = documentCountry;
    if (
      payload.national_id_number != null &&
      payload.national_id_number !== ''
    ) {
      kyc.national_id_number = payload.national_id_number.trim().slice(0, 64);
      kyc.national_id_number_hash = this.hashNationalId(
        payload.national_id_number,
      );
    }
    if (payload.email != null && payload.email.trim() !== '') {
      kyc.email = payload.email.trim().slice(0, 150);
    }
    if (payload.source != null && payload.source.trim() !== '') {
      const s = payload.source.trim().toUpperCase().slice(0, 20);
      if (['PAY', 'GO', 'STAYS'].includes(s)) {
        kyc.source = s;
      }
    }
    // Default PAY when no source (legacy / backward compat)
    if (kyc.source == null || kyc.source === '') {
      kyc.source = 'PAY';
    }
    await this.kycRepository.save(kyc);

    // Sync form data to User so it appears on user info / admin dashboard
    if (payload.full_name != null && payload.full_name.trim() !== '') {
      user.full_name = payload.full_name.trim().slice(0, 100);
    }
    if (payload.date_of_birth != null && payload.date_of_birth.trim() !== '') {
      const dob = payload.date_of_birth.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        user.date_of_birth = new Date(dob);
      }
    }
    if (payload.nationality != null && payload.nationality.trim() !== '') {
      user.nationality = payload.nationality.trim().slice(0, 10);
    }
    if (payload.email != null && payload.email.trim() !== '') {
      user.email = payload.email.trim().slice(0, 150);
    }
    if (payload.city != null && payload.city.trim() !== '') {
      user.city = payload.city.trim().slice(0, 100);
    }
    const docCc = this.resolveDocumentCountry(payload);
    if (!user.nationality?.trim()) {
      user.nationality = docCc;
    }
    user.kyc_status = 'PENDING';
    await this.userRepository.save(user);
    return kyc;
  }

  async getStatusForUser(userId: string) {
    const kyc = await this.kycRepository.findOne({
      where: { user_id: userId },
    });
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['kyc_status'],
    });
    return {
      user_id: userId,
      status: kyc?.status ?? 'NOT_STARTED',
      onboarding: deriveIdentityOnboardingState({
        kycProfileExists: !!kyc,
        kycStatus: kyc?.status ?? user?.kyc_status,
      }),
      documents: kyc?.documents ?? {
        id_document: false,
        selfie: false,
        liveness: false,
      },
    };
  }

  /** @deprecated Prefer getStatusForUser — phone-based lookup enables IDOR. */
  async getStatus(phoneNumber: string) {
    const norm = normalizePhoneOrThrow(phoneNumber);
    let user = await this.userRepository.findOne({
      where: { phone_number: norm },
    });
    if (!user) {
      const fallback = tryNormalizePhoneNumber(phoneNumber) !== phoneNumber
        ? await this.userRepository.findOne({ where: { phone_number: phoneNumber } })
        : null;
      if (fallback) user = fallback;
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.getStatusForUser(user.id);
  }
}
