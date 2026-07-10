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

export type DocumentUploadOptions = {
  side?: 'front' | 'back';
  document_type?: string;
  document_country?: string;
  /** ID from form (manual); stored in KycProfile by submitKyc */
  national_id_number?: string;
  /** ID extracted from document via OCR; stored separately for comparison */
  national_id_number_extracted?: string;
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
    const provided = digestHeader.trim().toLowerCase();
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(provided, 'hex');
    if (
      expectedBuffer.length !== providedBuffer.length ||
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

  private async applySumsubReviewStatus(params: {
    userId: string;
    source: string;
    applicantId?: string | null;
    externalUserId?: string | null;
    eventType?: string | null;
    reviewStatus?: string | null;
    reviewResult?: Record<string, unknown> | null;
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
      if (
        userRowKycStatus === 'VERIFIED' &&
        !user.profile_locked_at
      ) {
        user.profile_locked_at = new Date();
      }
      await this.userRepository.save(user);
    }

    return {
      updated: true,
      userId: params.userId,
      source: kyc.source,
      reviewStatus: params.reviewStatus ?? null,
      reviewAnswer: reviewAnswer ?? null,
      status: userRowKycStatus,
      kycProfileStatus: kyc.status,
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
    user.kyc_status = 'PENDING';
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

    let applicant: { id?: string; externalUserId?: string };
    try {
      applicant = JSON.parse(applicantText) as {
        id?: string;
        externalUserId?: string;
      };
    } catch {
      throw new BadRequestException('Sumsub applicant response invalid JSON');
    }

    if (!applicant.id) {
      return this.pendingSumsubSyncResult(userId, source);
    }

    const status = await this.sumsubRequest<{
      reviewStatus?: string;
      reviewResult?: Record<string, unknown>;
    }>('GET', `/resources/applicants/${applicant.id}/status`);

    return this.applySumsubReviewStatus({
      userId,
      source,
      applicantId: applicant.id,
      externalUserId: applicant.externalUserId ?? externalUserId,
      eventType: 'sumsubStatusSync',
      reviewStatus: status.reviewStatus ?? null,
      reviewResult: status.reviewResult ?? null,
    });
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
    const reviewResult =
      (payload.reviewResult as Record<string, unknown> | undefined) ||
      ((payload.review as Record<string, unknown> | undefined)?.reviewResult as Record<string, unknown> | undefined);
    const reviewAnswer = reviewResult?.reviewAnswer as string | undefined;
    const rejectLabels = reviewResult?.rejectLabels as unknown;

    const userId = this.extractUserIdFromExternalId(externalUserId);
    if (!userId) {
      return { received: true, updated: false, reason: 'missing external user id' };
    }

    const source = this.extractSourceFromExternalId(externalUserId);
    const result = await this.applySumsubReviewStatus({
      userId,
      source,
      applicantId,
      externalUserId,
      eventType,
      reviewStatus,
      reviewResult: reviewResult ?? null,
    });

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
    return {
      user_id: userId,
      status: kyc?.status ?? 'NOT_STARTED',
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
