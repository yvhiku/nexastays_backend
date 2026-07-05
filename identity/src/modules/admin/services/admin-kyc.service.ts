import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { appConfig } from '../../../common/config/app.config';
import { safeLogger } from '../../../common/logging/safe-logger';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { User } from '../../users/entities/user.entity';
import { AdminKycQueryDto } from '../dto/admin-kyc.query.dto';
import { AdminAuditService } from './admin-audit.service';
import { KycReuseService } from '../../users/kyc-reuse.service';
import { IdentitySnapshotService } from '../../identity-snapshot/identity-snapshot.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import { kycTierToLevel } from '../../identity-snapshot/identity-snapshot.types';

interface RequestUser {
  userId?: string;
  email?: string;
}

function getIpAndAgent(req?: Request): {
  ipAddress?: string;
  deviceId?: string;
} {
  if (!req) return {};
  const ip =
    (req as Request & { ip?: string }).ip ||
    (req.connection as { remoteAddress?: string } | undefined)?.remoteAddress ||
    (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  const ua = req.headers?.['user-agent'];
  return {
    ipAddress: ip ?? undefined,
    deviceId: ua ? String(ua).slice(0, 100) : undefined,
  };
}

const API_PREFIX = appConfig.apiPrefix;

/** Schemes we treat as absolute URLs (return as-is; no /kyc/files/ prefix). */
const ABSOLUTE_URL_SCHEMES = ['http://', 'https://', 's3://', 'gs://'];

function isAbsoluteUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return ABSOLUTE_URL_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

function fileUrlFromPath(
  userId: string,
  relativePath: string | null | undefined,
): string | null {
  if (!relativePath || typeof relativePath !== 'string') return null;
  if (isAbsoluteUrl(relativePath)) {
    return relativePath;
  }
  const filename = relativePath.includes('/')
    ? relativePath.split('/').pop()!
    : relativePath;
  return `/${API_PREFIX}/kyc/files/${userId}/${filename}`;
}

@Injectable()
export class AdminKycService {
  constructor(
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AdminAuditService,
    private readonly kycReuseService: KycReuseService,
    private readonly snapshotService: IdentitySnapshotService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  /** DEV only: returns KYC profile info for debugging. 404 in production. */
  async getDebugUser(userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Not found');
    }
    const kyc = await this.kycRepository.findOne({
      where: { user_id: userId },
      select: ['id', 'status', 'source', 'created_at'],
    });
    if (!kyc) {
      return {
        hasKycProfile: false,
        status: null,
        source: null,
        created_at: null,
      };
    }
    return {
      hasKycProfile: true,
      status: kyc.status,
      source: kyc.source ?? 'NULL',
      created_at: kyc.created_at,
    };
  }

  async getQueue(query: AdminKycQueryDto) {
    const srcRaw = (query.source ?? 'ALL').trim().toUpperCase();
    /** Unified KYC: ALL = all sources; otherwise filter by PAY | GO | STAYS */
    const src = srcRaw === '' ? 'ALL' : srcRaw;
    if (src !== 'ALL' && !['PAY', 'GO', 'STAYS'].includes(src)) {
      throw new BadRequestException(
        'source must be one of: PAY, GO, STAYS, ALL (or omit for unified)',
      );
    }

    const qb = this.kycRepository
      .createQueryBuilder('k')
      .leftJoin(User, 'u', 'u.id = k.user_id')
      .select([
        'k.id as id',
        'k.user_id as user_id',
        'u.phone_number as user_phone',
        'u.full_name as user_name',
        'k.status as status',
        'k.level as level',
        'k.provider as provider',
        'k.created_at as submitted_at',
        'k.reviewed_at as reviewed_at',
        'k.reviewed_by as reviewed_by',
        'k.last_webhook_event_type as last_webhook_event_type',
        'k.last_webhook_received_at as last_webhook_received_at',
        'k.rejection_reason as rejection_reason',
        'k.documents as documents',
        'k.aml_screening as aml_screening',
        'k.id_document_url as id_document_url',
        'k.selfie_url as selfie_url',
        'k.document_front_url as document_front_url',
        'k.document_back_url as document_back_url',
        'k.document_type as document_type',
        'k.document_country as document_country',
        'k.full_name as full_name',
        'k.email as email',
        'k.date_of_birth as date_of_birth',
        'k.nationality as nationality',
        'k.national_id_number as national_id_number',
        'k.national_id_number_extracted as national_id_number_extracted',
        'k.source as source',
        'u.account_type as account_type',
        'u.city as user_city',
        'u.email as user_email',
      ])
      .addSelect(
        `(SELECT CASE WHEN EXISTS (SELECT 1 FROM stays_host_profiles shp WHERE shp.user_id = k.user_id) THEN true ELSE false END)`,
        'is_host',
      )
      .orderBy('k.created_at', 'DESC');

    if (query.status && query.status !== 'all') {
      const statusVal = query.status.trim().toUpperCase();
      // KYC approve writes VERIFIED; treat APPROVED and VERIFIED as equivalent for filtering
      if (statusVal === 'APPROVED') {
        qb.andWhere('k.status IN (:...statuses)', {
          statuses: ['APPROVED', 'VERIFIED'],
        });
      } else {
        qb.andWhere('k.status = :status', { status: statusVal });
      }
    }

    {
      if (src === 'ALL') {
        // Unified: all KYC across ecosystem (PAY=null/PAY, GO, STAYS)
        qb.andWhere(
          '(k.source IS NULL OR k.source = :pay OR k.source = :go OR k.source = :stays)',
          { pay: 'PAY', go: 'GO', stays: 'STAYS' },
        );
      } else if (src === 'PAY') {
        qb.andWhere('(k.source IS NULL OR k.source = :source)', {
          source: 'PAY',
        });
      } else if (src === 'GO') {
        qb.andWhere('k.source = :source', { source: 'GO' });
      } else if (src === 'STAYS') {
        qb.andWhere('k.source = :source', { source: 'STAYS' });
      }
    }

    if (query.account_type && query.account_type.trim() !== '') {
      const act = query.account_type.trim().toUpperCase();
      const goTypes = ['CONSUMER', 'DRIVER', 'COURIER', 'MERCHANT'];
      const payTypes = ['CONSUMER', 'MERCHANT'];
      if ((src === 'ALL' || src === 'GO') && goTypes.includes(act)) {
        qb.andWhere('u.account_type = :accountType', { accountType: act });
      } else if ((src === 'PAY' || src === 'STAYS') && payTypes.includes(act)) {
        qb.andWhere('u.account_type = :accountType', { accountType: act });
      }
    }

    if (
      query.stays_role &&
      query.stays_role.trim() !== '' &&
      (src === 'STAYS' || src === 'ALL')
    ) {
      const role = query.stays_role.trim().toUpperCase();
      if (role === 'HOST') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM stays_host_profiles shp WHERE shp.user_id = k.user_id)',
        );
      } else if (role === 'USER') {
        qb.andWhere(
          'NOT EXISTS (SELECT 1 FROM stays_host_profiles shp WHERE shp.user_id = k.user_id)',
        );
      }
    }

    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(term)) {
        qb.andWhere('k.user_id = :userId', { userId: term });
      } else {
        qb.andWhere('u.phone_number ILIKE :phone', {
          phone: `%${term.replace(/%/g, '\\%')}%`,
        });
      }
    }

    const docCat = (query.document_category ?? '').trim().toLowerCase();
    if (docCat && docCat !== 'all') {
      if (docCat === 'national_id' || docCat === 'cin' || docCat === 'cni') {
        qb.andWhere(
          "(k.document_type ILIKE '%National Identity%' OR k.document_type ILIKE '%CNIE%' OR k.document_type ILIKE '%CIN%' OR k.document_type ILIKE '%Carte nationale%')",
        );
      } else if (docCat === 'passport') {
        qb.andWhere("k.document_type ILIKE '%Passport%'");
      } else if (
        docCat === 'driver_license' ||
        docCat === 'license' ||
        docCat === 'driving'
      ) {
        qb.andWhere(
          "(k.document_type ILIKE '%Driver%' OR k.document_type ILIKE '%Driving%' OR k.document_type ILIKE '%Permis%')",
        );
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const rows = await qb.getRawMany();
    return rows.map((row) => this.toAdminKycDto(row));
  }

  private toAdminKycDto(row: Record<string, unknown>) {
    const userId = row.user_id as string;
    const documentFrontPath = (row.document_front_url ??
      row.id_document_url) as string | null | undefined;
    const documentBackPath = row.document_back_url as string | null | undefined;
    const selfiePath = row.selfie_url as string | null | undefined;

    const kycFullName = (row.full_name as string | null | undefined) ?? null;
    const userFullName = (row.user_name as string | null | undefined) ?? null;
    const formFullName = kycFullName ?? userFullName;
    const kycEmail = (row.email as string | null | undefined) ?? null;
    const userEmail = (row.user_email as string | null | undefined) ?? null;
    const mergedEmail = kycEmail ?? userEmail;
    const userCity = (row.user_city as string | null | undefined) ?? null;

    const documentFileUrlFront = fileUrlFromPath(userId, documentFrontPath);
    const documentFileUrlBack = fileUrlFromPath(userId, documentBackPath);
    const selfieFileUrl = fileUrlFromPath(userId, selfiePath);

    return {
      userId,
      user_id: userId, // frontend compatibility (KycQueue uses user_id for approve)
      phoneNumber: row.user_phone ?? null,
      /** Flat fields for admin dashboards (avoid relying only on nested kycProfile). */
      document_type: row.document_type ?? null,
      document_country: row.document_country ?? null,
      national_id_number: row.national_id_number ?? null,
      national_id_number_extracted: row.national_id_number_extracted ?? null,
      full_name: formFullName,
      kyc_full_name: kycFullName,
      user_full_name: userFullName,
      email: mergedEmail,
      kyc_email: kycEmail,
      user_email: userEmail,
      city: userCity,
      date_of_birth: row.date_of_birth ?? null,
      nationality: row.nationality ?? null,
      document_file_url_front: documentFileUrlFront,
      document_file_url_back: documentFileUrlBack,
      selfie_file_url: selfieFileUrl,
      kycProfile: {
        status: row.status ?? 'PENDING',
        document_type: row.document_type ?? null,
        document_country: row.document_country ?? null,
        document_front_url: documentFrontPath ?? null,
        document_back_url: documentBackPath ?? null,
        selfie_url: selfiePath ?? null,
        rejection_reason: row.rejection_reason ?? null,
        reviewed_at: row.reviewed_at ?? null,
        reviewed_by: row.reviewed_by ?? null,
        last_webhook_event_type: row.last_webhook_event_type ?? null,
        last_webhook_received_at: row.last_webhook_received_at ?? null,
        document_file_url_front: documentFileUrlFront,
        document_file_url_back: documentFileUrlBack,
        selfie_file_url: selfieFileUrl,
        full_name: kycFullName,
        email: kycEmail,
        date_of_birth: row.date_of_birth ?? null,
        nationality: row.nationality ?? null,
        national_id_number: row.national_id_number ?? null,
        national_id_number_extracted: row.national_id_number_extracted ?? null,
      },
      id: row.id,
      status: (row.status as string) ?? 'PENDING',
      user_phone: row.user_phone,
      user_name: row.user_name,
      level: row.level,
      provider: row.provider,
      submitted_at: row.submitted_at,
      last_webhook_event_type: row.last_webhook_event_type ?? null,
      last_webhook_received_at: row.last_webhook_received_at ?? null,
      documents: row.documents || {
        id_document: false,
        selfie: false,
        liveness: false,
      },
      aml_screening: row.aml_screening || { status: 'PENDING', score: 0 },
      source: row.source ?? 'PAY',
      account_type: row.account_type ?? null,
      is_host: row.is_host === true || row.is_host === 'true',
    };
  }

  async getCase(id: string) {
    const qb = this.kycRepository
      .createQueryBuilder('k')
      .leftJoin(User, 'u', 'u.id = k.user_id')
      .select([
        'k.id as id',
        'k.user_id as user_id',
        'u.phone_number as user_phone',
        'u.full_name as user_name',
        'k.status as status',
        'k.level as level',
        'k.provider as provider',
        'k.created_at as submitted_at',
        'k.reviewed_at as reviewed_at',
        'k.reviewed_by as reviewed_by',
        'k.last_webhook_event_type as last_webhook_event_type',
        'k.last_webhook_received_at as last_webhook_received_at',
        'k.rejection_reason as rejection_reason',
        'k.documents as documents',
        'k.aml_screening as aml_screening',
        'k.id_document_url as id_document_url',
        'k.selfie_url as selfie_url',
        'k.document_front_url as document_front_url',
        'k.document_back_url as document_back_url',
        'k.document_type as document_type',
        'k.document_country as document_country',
        'k.full_name as full_name',
        'k.email as email',
        'k.date_of_birth as date_of_birth',
        'k.nationality as nationality',
        'k.national_id_number as national_id_number',
        'k.national_id_number_extracted as national_id_number_extracted',
        'k.source as source',
        'u.account_type as account_type',
        'u.city as user_city',
        'u.email as user_email',
      ])
      .addSelect(
        `(SELECT CASE WHEN EXISTS (SELECT 1 FROM stays_host_profiles shp WHERE shp.user_id = k.user_id) THEN true ELSE false END)`,
        'is_host',
      )
      .where('k.id = :id', { id });
    const row = await qb.getRawOne();
    if (!row) {
      throw new NotFoundException('KYC case not found');
    }
    return this.toAdminKycDto(row);
  }

  async approve(id: string, adminUser?: RequestUser, req?: Request) {
    const kyc = await this.kycRepository.findOne({ where: { id } });
    if (!kyc) {
      throw new NotFoundException('KYC case not found');
    }

    kyc.status = 'VERIFIED';
    kyc.reviewed_at = new Date();
    kyc.reviewed_by = adminUser?.email || adminUser?.userId || 'admin';
    kyc.rejection_reason = null;
    await this.kycRepository.save(kyc);

    const user = await this.userRepository.findOne({
      where: { id: kyc.user_id },
      select: ['id', 'phone_number', 'profile_locked_at'],
    });
    if (user?.phone_number) {
      try {
        await this.kycReuseService.syncFromKycApproval(user.phone_number, kyc);
      } catch (err) {
        safeLogger.info('Reusable KYC sync failed (non-fatal)', { userId: kyc.user_id, err: String((err as Error)?.message ?? err) });
      }
    }
    const updatePayload: { kyc_status: string; profile_locked_at?: Date } = {
      kyc_status: 'APPROVED',
    };
    if (user && !user.profile_locked_at) {
      updatePayload.profile_locked_at = new Date();
    }
    await this.userRepository.update(kyc.user_id, updatePayload);

    const { ipAddress, deviceId } = getIpAndAgent(req);
    await this.auditService.logAction({
      action: 'KYC_VERIFIED',
      entityType: 'kyc',
      entityId: kyc.id,
      userId: kyc.user_id,
      adminUser,
      ipAddress,
      deviceId,
    });

    await this.snapshotService.invalidate(kyc.user_id);
    const userRow = await this.userRepository.findOne({
      where: { id: kyc.user_id },
      select: ['id', 'unified_identity_id'],
    });
    void this.domainEvents.publish(EVENTS.KYC_UPDATED, 'identity', {
      userId: kyc.user_id,
      unifiedIdentityId: userRow?.unified_identity_id ?? '',
      kycStatus: 'VERIFIED',
      kycTier: (kyc.level ?? 'BASIC').toUpperCase(),
      kycLevel: kycTierToLevel(kyc.level),
    });

    return { success: true };
  }

  async reject(
    id: string,
    reason: string,
    adminUser?: RequestUser,
    req?: Request,
  ) {
    const kyc = await this.kycRepository.findOne({ where: { id } });
    if (!kyc) {
      throw new NotFoundException('KYC case not found');
    }

    kyc.status = 'REJECTED';
    kyc.reviewed_at = new Date();
    kyc.reviewed_by = adminUser?.email || adminUser?.userId || 'admin';
    kyc.rejection_reason = reason;
    await this.kycRepository.save(kyc);

    await this.userRepository.update(kyc.user_id, { kyc_status: 'REJECTED' });

    const { ipAddress, deviceId } = getIpAndAgent(req);
    await this.auditService.logAction({
      action: 'KYC_REJECTED',
      entityType: 'kyc',
      entityId: kyc.id,
      userId: kyc.user_id,
      metadata: { reason },
      adminUser,
      ipAddress,
      deviceId,
    });

    return { success: true };
  }

  async approveByUser(
    userId: string,
    adminUser?: RequestUser,
    req?: Request,
    expectedSource?: string,
  ) {
    const kyc = await this.kycRepository.findOne({
      where: { user_id: userId },
    });
    if (!kyc) {
      throw new NotFoundException('KYC case not found');
    }
    this.assertSourceMatch(kyc.source, expectedSource);
    return this.approve(kyc.id, adminUser, req);
  }

  async rejectByUser(
    userId: string,
    reason: string,
    adminUser?: RequestUser,
    req?: Request,
    expectedSource?: string,
  ) {
    const kyc = await this.kycRepository.findOne({
      where: { user_id: userId },
    });
    if (!kyc) {
      throw new NotFoundException('KYC case not found');
    }
    this.assertSourceMatch(kyc.source, expectedSource);
    return this.reject(kyc.id, reason, adminUser, req);
  }

  /** When expectedSource provided (PAY|GO|STAYS), verifies KYC belongs to that dashboard. */
  private assertSourceMatch(kycSource: string | null, expectedSource?: string) {
    if (!expectedSource || !['PAY', 'GO', 'STAYS'].includes(expectedSource))
      return;
    const kycSrc = (kycSource ?? 'PAY').toUpperCase();
    if (kycSrc !== expectedSource) {
      throw new ForbiddenException(
        `KYC was submitted from ${kycSrc}, not ${expectedSource}. Cannot approve from this dashboard.`,
      );
    }
  }
}
