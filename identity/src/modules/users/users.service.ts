import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { User } from './entities/user.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateRoleAccountDto } from './dto/create-role-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { AccountType } from './entities/user.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { OtpSession } from '../auth/entities/otp-session.entity';
import { OtpCode } from '../auth/entities/otp-code.entity';
import { OtpAttempt } from '../auth/entities/otp-attempt.entity';
import { PinAttempt } from '../auth/entities/pin-attempt.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { hashPin, verifyPinHash } from '../../common/security/pin-hasher';
import { UserConsent } from './entities/user-consent.entity';
import { UnifiedIdentityService } from './unified-identity.service';
import { IdentityPhoneNumbersService } from './identity-phone-numbers.service';
import { normalizePhoneOrThrow, tryNormalizePhoneNumber, phoneLookupCandidates } from '../../common/phone/phone-normalizer';
import {
  ProfileSyncService,
  type SharedProfileUpdate,
} from './profile-sync.service';
import { accountTypeToService } from './profile-sync-policy';
import { roleUsesConsumerForPayout } from './role-categories';
import PDFDocument from 'pdfkit';
import { detectImageType } from '../compliance/image-type.util';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { appConfig } from '../../common/config/app.config';

const PROFILE_PHOTO_DIR = 'uploads/profile';
const PROFILE_PHOTO_MAX_SIZE = 5 * 1024 * 1024; // 5MB
/** URL path returned in profile; client uses baseURL + this with Authorization to load image */
const PROFILE_PHOTO_URL_PATH = 'users/me/profile-photo';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(KycProfile)
    private readonly kycProfileRepository: Repository<KycProfile>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepository: Repository<TrustedDevice>,
    @InjectRepository(UserConsent)
    private readonly userConsentRepository: Repository<UserConsent>,
    @InjectRepository(OtpCode)
    private readonly otpCodeRepository: Repository<OtpCode>,
    private readonly unifiedIdentityService: UnifiedIdentityService,
    private readonly identityPhoneNumbersService: IdentityPhoneNumbersService,
    private readonly profileSyncService: ProfileSyncService,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  async ensureMandatoryConsentsAccepted(userId: string): Promise<void> {
    const current = await this.getCurrentConsents(userId);
    if (!current.mandatoryAccepted) {
      throw new ForbiddenException({
        code: 'CONSENT_REQUIRED',
        message: 'Please accept Terms and Privacy Policy to continue.',
      });
    }
  }

  async getCurrentConsents(userId: string) {
    const rows = await this.userConsentRepository.find({
      where: { user_id: userId },
      order: { accepted_at: 'DESC', created_at: 'DESC' },
    });

    const latestByType = new Map<
      'TERMS' | 'PRIVACY' | 'MARKETING',
      UserConsent
    >();
    for (const row of rows) {
      const type = row.consent_type;
      if (!latestByType.has(type)) {
        latestByType.set(type, row);
      }
    }

    const terms = latestByType.get('TERMS') ?? null;
    const privacy = latestByType.get('PRIVACY') ?? null;
    const marketing = latestByType.get('MARKETING') ?? null;

    const mandatoryAccepted =
      Boolean(terms?.granted) && Boolean(privacy?.granted);

    return {
      mandatoryAccepted,
      terms: terms
        ? {
            version: terms.version,
            granted: terms.granted,
            acceptedAt: terms.accepted_at,
            language: terms.language,
          }
        : null,
      privacy: privacy
        ? {
            version: privacy.version,
            granted: privacy.granted,
            acceptedAt: privacy.accepted_at,
            language: privacy.language,
          }
        : null,
      marketing: marketing
        ? {
            granted: marketing.granted,
            version: marketing.version,
            acceptedAt: marketing.accepted_at,
            language: marketing.language,
          }
        : null,
    };
  }

  async acceptMandatoryConsents(params: {
    userId: string;
    termsVersion: string;
    privacyVersion: string;
    language?: string | null;
    ipAddress?: string | null;
    deviceId?: string | null;
    marketingOptIn?: boolean;
    marketingVersion?: string | null;
  }) {
    const acceptedAt = new Date();
    const language = params.language ?? null;
    const ipAddress = params.ipAddress ?? null;
    const deviceId = params.deviceId ?? null;

    const records: UserConsent[] = [
      this.userConsentRepository.create({
        user_id: params.userId,
        consent_type: 'TERMS',
        version: params.termsVersion,
        granted: true,
        accepted_at: acceptedAt,
        ip_address: ipAddress,
        device_id: deviceId,
        language,
      }),
      this.userConsentRepository.create({
        user_id: params.userId,
        consent_type: 'PRIVACY',
        version: params.privacyVersion,
        granted: true,
        accepted_at: acceptedAt,
        ip_address: ipAddress,
        device_id: deviceId,
        language,
      }),
    ];

    if (typeof params.marketingOptIn === 'boolean') {
      records.push(
        this.userConsentRepository.create({
          user_id: params.userId,
          consent_type: 'MARKETING',
          version: params.marketingVersion || params.privacyVersion,
          granted: params.marketingOptIn,
          accepted_at: acceptedAt,
          ip_address: ipAddress,
          device_id: deviceId,
          language,
        }),
      );
    }

    await this.userConsentRepository.save(records);
    return this.getCurrentConsents(params.userId);
  }

  async updateMarketingConsent(params: {
    userId: string;
    granted: boolean;
    version: string;
    language?: string | null;
    ipAddress?: string | null;
    deviceId?: string | null;
  }) {
    const record = this.userConsentRepository.create({
      user_id: params.userId,
      consent_type: 'MARKETING',
      version: params.version,
      granted: params.granted,
      accepted_at: new Date(),
      ip_address: params.ipAddress ?? null,
      device_id: params.deviceId ?? null,
      language: params.language ?? null,
    });
    await this.userConsentRepository.save(record);
    return this.getCurrentConsents(params.userId);
  }

  async listTrustedDevices(userId: string, currentDeviceId?: string | null) {
    const rows = await this.trustedDeviceRepository.find({
      where: { user_id: userId, trusted: true },
      order: { last_seen_at: 'DESC', created_at: 'DESC' },
    });
    const current = (currentDeviceId || '').trim();
    return rows.map((row) => ({
      id: row.id,
      device_id: row.device_id,
      device_name: row.device_name || 'Unknown device',
      trusted: row.trusted,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      is_current: current.length > 0 && current === row.device_id,
    }));
  }

  async removeTrustedDevice(
    userId: string,
    deviceId: string,
    currentDeviceId?: string | null,
  ): Promise<{ removed: boolean; force_logout_current_device: boolean }> {
    const normalizedDeviceId = (deviceId || '').trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId is required');
    }
    const row = await this.trustedDeviceRepository.findOne({
      where: { user_id: userId, device_id: normalizedDeviceId, trusted: true },
    });
    if (!row) {
      throw new NotFoundException('Trusted device not found');
    }
    row.trusted = false;
    row.last_seen_at = new Date();
    await this.trustedDeviceRepository.save(row);

    await this.refreshTokenRepository
      .createQueryBuilder()
      .update()
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('device_id = :deviceId', { deviceId: normalizedDeviceId })
      .andWhere('revoked_at IS NULL')
      .execute();

    const current = (currentDeviceId || '').trim();
    return {
      removed: true,
      force_logout_current_device:
        current.length > 0 && current === normalizedDeviceId,
    };
  }

  async createUser(payload: CreateUserDto) {
    const phone = normalizePhoneOrThrow(payload.phone_number);
    const candidates = [phone];
    if (tryNormalizePhoneNumber(payload.phone_number) !== payload.phone_number) {
      candidates.push(payload.phone_number);
    }
    const existingConsumer = await this.userRepository.findOne({
      where: candidates.map((p) => ({ phone_number: p, account_type: 'CONSUMER' })),
    });
    if (existingConsumer) {
      throw new ConflictException(
        'A consumer account with this phone number already exists',
      );
    }

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const pinHash = await hashPin(payload.pin);
        const u = await manager.save(User, {
          phone_number: phone,
          full_name: payload.full_name ?? undefined,
          nationality: 'MA',
          kyc_status: 'PENDING',
          pin_hash: pinHash,
          status: 'ACTIVE',
          account_type: 'CONSUMER',
        });
        return u;
      });

      if (user.phone_number) {
        await this.unifiedIdentityService.findOrCreateByPhone(user.phone_number);
      }
      return user;
    } catch (e: any) {
      if (e?.code === '23505') {
        const existing = await this.userRepository.findOne({
          where: candidates.map((p) => ({ phone_number: p, account_type: 'CONSUMER' })),
        });
        if (existing) return existing;
      }
      throw e;
    }
  }

  /**
   * Unified Nexa account: get shared profile for a phone (one identity across all apps).
   * Prefers UnifiedIdentity when present; falls back to legacy user-based lookup for migration safety.
   */
  async getNexaProfileByPhone(phoneNumber: string): Promise<{
    exists: boolean;
    full_name?: string | null;
    email?: string | null;
    date_of_birth?: string | null;
    city?: string | null;
    address?: string | null;
    kyc_status?: string;
    identity_verified: boolean;
    linked_services: string[];
  } | null> {
    const unified = await this.unifiedIdentityService.getProfileByPhone(phoneNumber);
    if (unified) {
      return {
        exists: true,
        full_name: unified.full_name,
        email: unified.email,
        date_of_birth: unified.date_of_birth,
        city: unified.city,
        address: unified.address,
        kyc_status: unified.kyc_status,
        identity_verified: unified.identity_verified,
        linked_services: unified.linked_services,
      };
    }

    const candidates = phoneLookupCandidates(phoneNumber);
    let users = await this.userRepository.find({
      where: candidates.map((phone_number) => ({ phone_number })),
      select: ['id', 'account_type', 'full_name', 'email', 'date_of_birth', 'city', 'kyc_status'],
      order: { account_type: 'ASC' },
    });
    if (users.length === 0) return null;

    const consumer = users.find((u) => u.account_type === 'CONSUMER');
    const best = consumer ?? users[0];

    const kyc = await this.kycProfileRepository.findOne({
      where: { user_id: best.id },
      select: ['status', 'full_name', 'email', 'date_of_birth', 'document_type'],
    });

    const kycStatus = (best.kyc_status ?? kyc?.status ?? 'PENDING').toUpperCase();
    const identityVerified =
      kycStatus === 'APPROVED' || kycStatus === 'VERIFIED';

    return {
      exists: true,
      full_name: best.full_name ?? kyc?.full_name ?? null,
      email: best.email ?? kyc?.email ?? null,
      date_of_birth: best.date_of_birth
        ? (best.date_of_birth instanceof Date
            ? best.date_of_birth.toISOString().slice(0, 10)
            : String(best.date_of_birth).slice(0, 10))
        : kyc?.date_of_birth ?? null,
      city: best.city ?? null,
      address: null,
      kyc_status: best.kyc_status ?? kyc?.status ?? 'PENDING',
      identity_verified: identityVerified,
      linked_services: users.map((u) => String(u.account_type ?? 'CONSUMER')),
    };
  }

  /**
   * Find a role account by unified identity and account type.
   * Preferred method; all service accounts attach to UnifiedIdentity.
   */
  async findByUnifiedIdentityIdAndAccountType(
    unifiedIdentityId: string,
    accountType: string,
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        unified_identity_id: unifiedIdentityId,
        account_type: accountType as any,
      },
      select: ['id'],
    });
  }

  /**
   * Find a role account (e.g. DRIVER) by linked CONSUMER id.
   * @deprecated Use findByUnifiedIdentityIdAndAccountType. linked_user_id is legacy; identity is primary.
   */
  async findByLinkedUserIdAndAccountType(
    linkedUserId: string,
    accountType: string,
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: { linked_user_id: linkedUserId, account_type: accountType as any },
      select: ['id'],
    });
  }

  /**
   * Find user by id. Returns null if not found.
   */
  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'account_type', 'phone_number', 'full_name', 'email', 'unified_identity_id'],
    });
  }

  /**
   * Get CONSUMER account for an identity (for payouts, wallet operations).
   * Returns null if identity has no CONSUMER account.
   */
  async getConsumerForIdentity(unifiedIdentityId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        unified_identity_id: unifiedIdentityId,
        account_type: 'CONSUMER',
      },
      select: ['id', 'phone_number', 'full_name'],
    });
  }

  /**
   * Find (only) a CONSUMER user by phone. Returns null if not found.
   * Used when resolving OTP session for non-KYC routes (e.g. profile update).
   */
  async findForKyc(phoneNumber: string): Promise<User | null> {
    const candidates = phoneLookupCandidates(phoneNumber);
    if (candidates.length === 0) return null;
    return this.userRepository.findOne({
      where: candidates.map((phone_number) => ({
        phone_number,
        account_type: 'CONSUMER',
      })),
    });
  }

  /**
   * Find or create a CONSUMER user for KYC flow (registration before PIN set).
   * Used when KYC is submitted with OTP session token - creates user with temp PIN
   * that will be replaced when the user calls setPin.
   */
  async findOrCreateForKyc(
    phoneNumber: string,
    fullName?: string,
    nationality?: string,
  ): Promise<User> {
    const phone = normalizePhoneOrThrow(phoneNumber);
    const existing = await this.findForKyc(phone);
    if (existing) return existing;

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const tempPinHash = await hashPin(
          `kyc-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        const u = await manager.save(User, {
          phone_number: phone,
          full_name: fullName ?? undefined,
          nationality: nationality ?? 'MA',
          kyc_status: 'PENDING',
          pin_hash: tempPinHash,
          status: 'ACTIVE',
          account_type: 'CONSUMER',
        });
        return u;
      });
      if (user.phone_number) {
        await this.unifiedIdentityService.findOrCreateByPhone(user.phone_number);
      }
      return user;
    } catch (e: any) {
      if (e?.code === '23505') {
        const found = await this.findForKyc(phone);
        if (found) return found;
      }
      throw e;
    }
  }

  /**
   * Create a DRIVER/COURIER/HOST/MERCHANT account under a UnifiedIdentity.
   * UnifiedIdentity is the canonical root; no structural dependency on CONSUMER.
   * Phone must match the identity. No wallet is created for non-CONSUMER accounts.
   * @throws ConflictException if role already exists (use ensureRoleAccount for idempotent behavior).
   */
  async createRoleAccount(payload: CreateRoleAccountDto): Promise<User> {
    const existing = await this.findByUnifiedIdentityIdAndAccountType(
      payload.unified_identity_id,
      payload.account_type,
    );
    if (existing) {
      throw new ConflictException(
        `A ${payload.account_type} account for this identity already exists`,
      );
    }
    return this.doCreateRoleAccount(payload);
  }

  /**
   * Ensure role account exists; return existing if found (idempotent).
   * Use in approval flows to avoid duplicate creation on re-approval or concurrent approvals.
   */
  async ensureRoleAccount(payload: CreateRoleAccountDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: {
        unified_identity_id: payload.unified_identity_id,
        account_type: payload.account_type,
      },
    });
    if (existing) return existing;
    return this.doCreateRoleAccount(payload);
  }

  private async doCreateRoleAccount(
    payload: CreateRoleAccountDto,
  ): Promise<User> {
    const phone = normalizePhoneOrThrow(payload.phone_number);
    const identity = await this.unifiedIdentityService.findById(
      payload.unified_identity_id,
    );
    if (!identity) {
      throw new NotFoundException('Unified identity not found');
    }
    const identityPhone =
      identity.phone_number ??
      (await this.identityPhoneNumbersService.getPrimaryPhone(identity.id));
    const normPayload = phone;
    const normIdentity =
      this.identityPhoneNumbersService.tryNormalize(identityPhone ?? '') ??
      identityPhone;
    if (
      identityPhone &&
      normPayload !== normIdentity &&
      normPayload !== normIdentity
    ) {
      throw new BadRequestException(
        'phone_number must match the identity phone',
      );
    }

    const pinPlaceholder = await hashPin('role-account-no-pin');
    try {
      const user = await this.userRepository.save({
        phone_number: phone,
        full_name: payload.full_name ?? undefined,
        account_type: payload.account_type as AccountType,
        unified_identity_id: payload.unified_identity_id,
        linked_user_id: payload.linked_user_id ?? null,
        pin_hash: pinPlaceholder,
        status: 'ACTIVE',
        kyc_status: 'PENDING',
      });
      await this.unifiedIdentityService.refreshLinkedServices(
        payload.unified_identity_id,
      );
      return user;
    } catch (e: any) {
      if (e?.code === '23505') {
        const found = await this.findByUnifiedIdentityIdAndAccountType(
          payload.unified_identity_id,
          payload.account_type,
        );
        if (found) return found;
      }
      throw e;
    }
  }

  /** Profile is locked when KYC approved/verified or profile_locked_at set. */
  isProfileLocked(user: User): boolean {
    const status = (user.kyc_status || '').toUpperCase();
    if (status === 'APPROVED' || status === 'VERIFIED') return true;
    return !!user.profile_locked_at;
  }

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['linked_user'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    let linked: User | null = null;
    if (user.unified_identity_id && roleUsesConsumerForPayout(user.account_type)) {
      linked = await this.getConsumerForIdentity(user.unified_identity_id);
    }
    if (!linked && user.linked_user) {
      linked = user.linked_user;
    }
    const profileLocked = this.isProfileLocked(user);
    const identity = user.unified_identity_id
      ? await this.unifiedIdentityService.findById(user.unified_identity_id)
      : null;
    const sharedFromIdentity = identity
      ? {
          full_name: identity.full_name ?? user.full_name,
          email: identity.email ?? user.email,
          city: identity.city ?? user.city ?? null,
          date_of_birth: identity.date_of_birth
            ? identity.date_of_birth instanceof Date
              ? identity.date_of_birth.toISOString().slice(0, 10)
              : String(identity.date_of_birth).slice(0, 10)
            : user.date_of_birth
              ? user.date_of_birth instanceof Date
                ? user.date_of_birth.toISOString().slice(0, 10)
                : String(user.date_of_birth).slice(0, 10)
              : null,
          profile_photo_url: identity.profile_photo_url ?? user.profile_photo_url ?? null,
          address: identity.address ?? null,
          preferred_language: identity.preferred_language ?? null,
        }
      : {
          full_name: user.full_name,
          email: user.email,
          city: user.city ?? null,
          date_of_birth: user.date_of_birth
            ? user.date_of_birth instanceof Date
              ? user.date_of_birth.toISOString().slice(0, 10)
              : String(user.date_of_birth).slice(0, 10)
            : null,
          profile_photo_url: user.profile_photo_url ?? null,
          address: null as string | null,
          preferred_language: null as string | null,
        };
    const out: Record<string, unknown> = {
      id: user.id,
      phone_number: user.phone_number,
      ...sharedFromIdentity,
      account_type: user.account_type ?? 'CONSUMER',
      unified_identity_id: user.unified_identity_id ?? null,
      linked_user_id: user.linked_user_id ?? (linked?.id ?? null),
      kyc_status: user.kyc_status,
      status: user.status,
      risk_score: user.risk_score,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      nationality: user.nationality ?? null,
      profile_locked: profileLocked,
      locked_fields: profileLocked ? ['full_name', 'date_of_birth'] : [],
      updated_at: identity?.updated_at ?? user.updated_at,
      deletion_status: user.deletion_status ?? 'NONE',
      deletion_requested_at: user.deletion_requested_at ?? null,
      deletion_scheduled_for: user.deletion_scheduled_for ?? null,
      pii_anonymized_at: user.pii_anonymized_at ?? null,
      rewards_tier: user.rewards_tier ?? 'standard',
    };
    if (linked) {
      (out as any).linked_user = {
        id: linked.id,
        full_name: linked.full_name,
        phone_number: linked.phone_number,
      };
    }
    return out;
  }

  private async assertReauthPin(userId: string, pin: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'pin_hash'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const result = await verifyPinHash(pin, user.pin_hash);
    if (!result.valid) {
      throw new UnauthorizedException('Re-authentication failed');
    }
  }

  private csvEscape(value: unknown): string {
    const raw = value == null ? '' : String(value);
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  private async buildDataExportCsv(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const txns: Array<{
      id: string;
      reference: string;
      type: string;
      status: string;
      amount: number;
      sender_user_id?: string | null;
      receiver_user_id?: string | null;
      created_at?: Date;
    }> = [];

    const profileHeader = 'section,field,value';
    const profileRows = [
      ['profile', 'user_id', user.id],
      ['profile', 'phone_number', user.phone_number],
      ['profile', 'full_name', user.full_name ?? ''],
      ['profile', 'email', user.email ?? ''],
      ['profile', 'city', user.city ?? ''],
      ['profile', 'kyc_status', user.kyc_status],
      ['profile', 'status', user.status],
      ['profile', 'created_at', user.created_at?.toISOString() ?? ''],
      ['profile', 'updated_at', user.updated_at?.toISOString() ?? ''],
    ]
      .map((row) => row.map((v) => this.csvEscape(v)).join(','))
      .join('\n');

    const txnHeader =
      'section,transaction_id,reference,type,status,amount,sender_user_id,receiver_user_id,created_at';
    const txnRows = txns
      .map((t) =>
        [
          'transaction',
          t.id,
          t.reference,
          t.type,
          t.status,
          t.amount,
          t.sender_user_id ?? '',
          t.receiver_user_id ?? '',
          t.created_at?.toISOString() ?? '',
        ]
          .map((v) => this.csvEscape(v))
          .join(','),
      )
      .join('\n');

    return [profileHeader, profileRows, '', txnHeader, txnRows].join('\n');
  }

  private async buildDataExportPdf(userId: string): Promise<Buffer> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const txns: Array<{
      id: string;
      reference: string;
      type: string;
      status: string;
      amount: number;
      created_at?: Date;
    }> = [];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Nexa Identity - Personal Data Export');
      doc.moveDown();
      doc.fontSize(12).text(`Generated at: ${new Date().toISOString()}`);
      doc.text(`User ID: ${user.id}`);
      doc.text(`Phone: ${user.phone_number}`);
      doc.text(`Full name: ${user.full_name ?? '-'}`);
      doc.text(`Email: ${user.email ?? '-'}`);
      doc.text(`City: ${user.city ?? '-'}`);
      doc.moveDown();
      doc.fontSize(14).text(`Transactions (${txns.length})`);
      doc.moveDown(0.5);
      doc.fontSize(10);
      for (const t of txns) {
        doc.text(
          `${t.created_at?.toISOString() ?? ''} | ${t.reference} | ${t.type} | ${t.status} | ${Number(t.amount).toFixed(2)} MAD`,
        );
      }
      doc.end();
    });
  }

  async exportUserData(params: {
    userId: string;
    pin: string;
    format: 'csv' | 'pdf';
  }): Promise<{ filename: string; mimeType: string; contentBase64: string }> {
    await this.assertReauthPin(params.userId, params.pin);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (params.format === 'csv') {
      const csv = await this.buildDataExportCsv(params.userId);
      return {
        filename: `nexa_export_${timestamp}.csv`,
        mimeType: 'text/csv',
        contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
      };
    }
    const pdf = await this.buildDataExportPdf(params.userId);
    return {
      filename: `nexa_export_${timestamp}.pdf`,
      mimeType: 'application/pdf',
      contentBase64: pdf.toString('base64'),
    };
  }

  private anonymizedPhone(seed: string): string {
    const compact = seed.replace(/-/g, '').slice(0, 10);
    return `DEL${compact}`.slice(0, 20);
  }

  async getDeletionStatus(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'deletion_status',
        'deletion_requested_at',
        'deletion_scheduled_for',
        'pii_anonymized_at',
      ],
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      status: user.deletion_status ?? 'NONE',
      requestedAt: user.deletion_requested_at ?? null,
      scheduledFor: user.deletion_scheduled_for ?? null,
      piiAnonymizedAt: user.pii_anonymized_at ?? null,
    };
  }

  async requestAccountDeletion(params: {
    userId: string;
    pin: string;
    reason?: string;
  }) {
    await this.assertReauthPin(params.userId, params.pin);
    const user = await this.userRepository.findOne({
      where: { id: params.userId },
    });
    if (!user) throw new NotFoundException('User not found');
    if ((user.deletion_status ?? 'NONE') === 'PENDING') {
      return this.getDeletionStatus(params.userId);
    }

    const now = new Date();
    const retentionDays = 30;
    const scheduled = new Date(
      now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
    );

    user.deletion_status = 'PENDING';
    user.deletion_requested_at = now;
    user.deletion_scheduled_for = scheduled;
    user.pii_anonymized_at = now;
    user.full_name = 'Deleted User';
    user.email = '';
    user.city = null;
    user.date_of_birth = null;
    user.profile_photo_url = null;
    user.status = 'DELETION_PENDING';
    user.phone_number = this.anonymizedPhone(user.id);
    await this.userRepository.save(user);

    await this.refreshTokenRepository
      .createQueryBuilder()
      .update()
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId: params.userId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return {
      status: user.deletion_status,
      requestedAt: user.deletion_requested_at,
      scheduledFor: user.deletion_scheduled_for,
      piiAnonymizedAt: user.pii_anonymized_at,
      note: params.reason || null,
    };
  }

  async updateProfile(userId: string, payload: UpdateProfileDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const locked = this.isProfileLocked(user);

    if (locked) {
      if (
        payload.full_name != null &&
        payload.full_name !== user.full_name
      ) {
        throw new ForbiddenException({
          code: 'PROFILE_LOCKED',
          message:
            'KYC verified: full name and date of birth are locked. Contact support to update.',
        });
      }
      const incomingDob = payload.date_of_birth;
      const currentDob = user.date_of_birth
        ? user.date_of_birth instanceof Date
          ? user.date_of_birth.toISOString().slice(0, 10)
          : String(user.date_of_birth).slice(0, 10)
        : null;
      if (incomingDob != null && incomingDob !== currentDob) {
        throw new ForbiddenException({
          code: 'PROFILE_LOCKED',
          message:
            'KYC verified: full name and date of birth are locked. Contact support to update.',
        });
      }
    }

    const sharedUpdates = {
      full_name: payload.full_name,
      email: payload.email,
      date_of_birth: payload.date_of_birth
        ? new Date(payload.date_of_birth)
        : undefined,
      city: payload.city,
      address: payload.address,
      profile_photo_url: payload.profile_photo_url,
      preferred_language: payload.preferred_language,
    };

    if (user.unified_identity_id) {
      await this.profileSyncService.updateSharedProfile(
        sharedUpdates as SharedProfileUpdate,
        {
          service: accountTypeToService(user.account_type),
          userId,
          unifiedIdentityId: user.unified_identity_id,
          profileLocked: locked,
          identityVerified: (user.kyc_status ?? '').toUpperCase() === 'APPROVED' ||
            (user.kyc_status ?? '').toUpperCase() === 'VERIFIED',
          auditParams: { actorUserId: userId, actorRole: user.account_type },
        },
      );
    } else {
      if (locked) {
        if (sharedUpdates.email !== undefined) user.email = sharedUpdates.email;
        if (sharedUpdates.city !== undefined) user.city = sharedUpdates.city || null;
        if (sharedUpdates.profile_photo_url !== undefined)
          user.profile_photo_url = sharedUpdates.profile_photo_url;
      } else {
        if (sharedUpdates.full_name !== undefined) user.full_name = sharedUpdates.full_name;
        if (sharedUpdates.email !== undefined) user.email = sharedUpdates.email;
        if (sharedUpdates.city !== undefined) user.city = sharedUpdates.city || null;
        if (sharedUpdates.date_of_birth !== undefined)
          user.date_of_birth = sharedUpdates.date_of_birth ?? null;
        if (sharedUpdates.profile_photo_url !== undefined)
          user.profile_photo_url = sharedUpdates.profile_photo_url;
      }
      await this.userRepository.save(user);
    }

    if (payload.nationality !== undefined) {
      user.nationality = payload.nationality;
      await this.userRepository.save(user);
    }

    return this.userRepository.findOneOrFail({ where: { id: userId } });
  }

  /**
   * Set profile_locked_at when KYC becomes APPROVED/VERIFIED.
   * Call from KYC approve flow; never unset profile_locked_at.
   */
  async lockProfileIfVerified(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;
    const status = (user.kyc_status || '').toUpperCase();
    if (
      (status !== 'APPROVED' && status !== 'VERIFIED') ||
      user.profile_locked_at
    ) {
      return;
    }
    await this.userRepository.update(userId, { profile_locked_at: new Date() });
  }

  private validateProfilePhotoFile(
    file: Express.Multer.File | undefined,
  ): 'jpeg' | 'png' {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > PROFILE_PHOTO_MAX_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${PROFILE_PHOTO_MAX_SIZE / 1024 / 1024}MB`,
      );
    }
    const detected = detectImageType(file.buffer);
    if (detected !== 'jpeg' && detected !== 'png') {
      throw new BadRequestException(
        'Invalid file type. Only JPEG and PNG images are allowed.',
      );
    }
    return detected;
  }

  private getProfilePhotoExtension(detected: 'jpeg' | 'png'): string {
    return detected === 'png' ? '.png' : '.jpg';
  }

  /**
   * Upload profile photo for the current user. Saves file and updates user.profile_photo_url.
   * Returns the URL path the client should use to load the image (with Authorization header).
   */
  async uploadProfilePhoto(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ profile_photo_url: string }> {
    const detected = this.validateProfilePhotoFile(file);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const ext = this.getProfilePhotoExtension(detected);
    const filename = `${userId}${ext}`;
    await fs.mkdir(PROFILE_PHOTO_DIR, { recursive: true });
    await fs.writeFile(path.join(PROFILE_PHOTO_DIR, filename), file!.buffer);
    const urlPath = PROFILE_PHOTO_URL_PATH;
    if (user.unified_identity_id) {
      await this.profileSyncService.updateSharedProfile(
        { profile_photo_url: urlPath },
        {
          service: accountTypeToService(user.account_type ?? 'CONSUMER'),
          userId,
          unifiedIdentityId: user.unified_identity_id,
          profileLocked: this.isProfileLocked(user),
          identityVerified:
            (user.kyc_status ?? '').toUpperCase() === 'APPROVED' ||
            (user.kyc_status ?? '').toUpperCase() === 'VERIFIED',
          auditParams: { actorUserId: userId, actorRole: user.account_type },
        },
      );
    } else {
      user.profile_photo_url = urlPath;
      await this.userRepository.save(user);
    }
    return { profile_photo_url: urlPath };
  }

  /**
   * Change phone number with OTP verification.
   * Requires: current_otp (sent to current phone), new_phone_number, new_otp (sent to new phone).
   */
  async changePhone(
    userId: string,
    currentOtp: string,
    newPhoneNumber: string,
    newOtp: string,
  ): Promise<{ phone_number: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'phone_number'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.phone_number) {
      throw new BadRequestException(
        'This account does not use a phone number; add phone via account setup.',
      );
    }

    const normalizedNew = normalizePhoneOrThrow(newPhoneNumber);
    if (normalizedNew === user.phone_number) {
      throw new BadRequestException('New phone number is the same as current');
    }

    const currentPhoneNorm =
      tryNormalizePhoneNumber(user.phone_number) ?? user.phone_number;
    // Verify current OTP (stored normalized; support legacy)
    const [currentOtpRecord] = await this.otpCodeRepository.find({
      where: [
        { phone_number: user.phone_number },
        { phone_number: currentPhoneNorm },
      ],
      order: { created_at: 'DESC' },
      take: 1,
    });
    if (
      !currentOtpRecord ||
      currentOtpRecord.consumed_at ||
      currentOtpRecord.expires_at.getTime() < Date.now()
    ) {
      throw new BadRequestException('Current OTP invalid or expired. Request a new code.');
    }
    if (currentOtp !== currentOtpRecord.code) {
      throw new BadRequestException('Invalid OTP for current phone');
    }
    currentOtpRecord.consumed_at = new Date();
    await this.otpCodeRepository.save(currentOtpRecord);

    // Verify new OTP
    const newOtpRecord = await this.otpCodeRepository.findOne({
      where: { phone_number: normalizedNew },
      order: { created_at: 'DESC' },
    });
    if (
      !newOtpRecord ||
      newOtpRecord.consumed_at ||
      newOtpRecord.expires_at.getTime() < Date.now()
    ) {
      throw new BadRequestException('New phone OTP invalid or expired. Request a new code.');
    }
    if (newOtp !== newOtpRecord.code) {
      throw new BadRequestException('Invalid OTP for new phone');
    }
    newOtpRecord.consumed_at = new Date();
    await this.otpCodeRepository.save(newOtpRecord);

    // Check new phone not already used
    const existing = await this.userRepository.findOne({
      where: { phone_number: normalizedNew },
    });
    if (existing) {
      throw new ConflictException('This phone number is already registered');
    }

    user.phone_number = normalizedNew;
    await this.userRepository.save(user);

    return { phone_number: normalizedNew };
  }

  /**
   * Resolve filesystem path for the user's profile photo. Returns null if none set.
   */
  async getProfilePhotoPath(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'profile_photo_url'],
    });
    if (!user || user.profile_photo_url !== PROFILE_PHOTO_URL_PATH) {
      return null;
    }
    const jpg = path.join(PROFILE_PHOTO_DIR, `${userId}.jpg`);
    const jpeg = path.join(PROFILE_PHOTO_DIR, `${userId}.jpeg`);
    const png = path.join(PROFILE_PHOTO_DIR, `${userId}.png`);
    try {
      await fs.access(jpg);
      return jpg;
    } catch {
      //
    }
    try {
      await fs.access(jpeg);
      return jpeg;
    } catch {
      //
    }
    try {
      await fs.access(png);
      return png;
    } catch {
      //
    }
    return null;
  }

  /**
   * Clear OTP sessions, codes, and attempts for a phone number so it can be reused.
   * Also nulls otp_sessions.user_id for the given userId to avoid FK issues on user delete.
   */
  private async clearOtpDataForPhone(
    phoneNumber: string,
    userId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const otpSessionRepo = manager.getRepository(OtpSession);
      const otpCodeRepo = manager.getRepository(OtpCode);
      const otpAttemptRepo = manager.getRepository(OtpAttempt);
      const pinAttemptRepo = manager.getRepository(PinAttempt);
      const trustedDeviceRepo = manager.getRepository(TrustedDevice);
      await otpSessionRepo.update({ user_id: userId }, { user_id: null });
      await otpCodeRepo.delete({ phone_number: phoneNumber });
      await otpAttemptRepo.delete({ phone_number: phoneNumber });
      await pinAttemptRepo.delete({ user_id: userId });
      await trustedDeviceRepo.delete({ user_id: userId });
    });
  }

  /**
   * Delete the current user's account.
   * Only CONSUMER accounts are supported.
   * Cleans OTP data so the phone number can be reused for a new account.
   */
  async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.account_type !== 'CONSUMER') {
      throw new BadRequestException(
        'Only consumer accounts can be deleted from the app',
      );
    }

    if (user.phone_number) {
      await this.clearOtpDataForPhone(user.phone_number, userId);
    }

    const photoPath = await this.getProfilePhotoPath(userId);

    await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const kycRepo = manager.getRepository(KycProfile);
      const idempotencyRepo = manager.getRepository(IdempotencyKey);
      const auditRepo = manager.getRepository(AuditLog);
      const refreshRepo = manager.getRepository(RefreshToken);
      const otpSessionRepo = manager.getRepository(OtpSession);
      const otpCodeRepo = manager.getRepository(OtpCode);
      const otpAttemptRepo = manager.getRepository(OtpAttempt);
      const pinAttemptRepo = manager.getRepository(PinAttempt);
      const trustedDeviceRepo = manager.getRepository(TrustedDevice);

      await otpSessionRepo.update({ user_id: userId }, { user_id: null });
      if (user.phone_number) {
        await otpCodeRepo.delete({ phone_number: user.phone_number });
        await otpAttemptRepo.delete({ phone_number: user.phone_number });
      }
      await pinAttemptRepo.delete({ user_id: userId });
      await trustedDeviceRepo.delete({ user_id: userId });

      await kycRepo.delete({ user_id: userId });
      await idempotencyRepo.delete({ user_id: userId });
      await auditRepo
        .createQueryBuilder()
        .update()
        .set({ user_id: () => 'NULL' })
        .where('user_id = :userId', { userId })
        .execute();
      await refreshRepo.delete({ user_id: userId });
      await userRepo.delete({ id: userId });
    });

    // Remove profile photo file if exists
    if (photoPath) {
      try {
        await fs.unlink(photoPath);
      } catch {
        // Ignore
      }
    }

    return { message: 'Account deleted successfully' };
  }

  async getHeaderState(
    userId: string,
    authorizationHeader?: string,
  ): Promise<{
    notificationCount: number;
    inboxCount: number;
    avatar: string | null;
    hostMode: boolean;
  }> {
    const [me, notificationCount, stays] = await Promise.all([
      this.getMe(userId),
      this.userNotificationsService.unreadCount(userId),
      this.fetchStaysHeaderState(authorizationHeader),
    ]);

    const profile = me as { profile_photo_url?: string | null };
    return {
      notificationCount,
      inboxCount: stays.inboxCount,
      avatar: profile.profile_photo_url ?? null,
      hostMode: stays.hostMode,
    };
  }

  private async fetchStaysHeaderState(authorizationHeader?: string): Promise<{
    inboxCount: number;
    hostMode: boolean;
  }> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return { inboxCount: 0, hostMode: false };
    }
    const base = appConfig.staysApiBaseUrl;
    const headers = { Authorization: authorizationHeader };
    const [inboxResult, hostResult] = await Promise.allSettled([
      fetch(`${base}/messaging/conversations/unread-count`, { headers }),
      fetch(`${base}/stays/host/me`, { headers }),
    ]);

    let inboxCount = 0;
    let hostMode = false;

    if (inboxResult.status === 'fulfilled' && inboxResult.value.ok) {
      try {
        const body = (await inboxResult.value.json()) as { count?: number };
        inboxCount = body.count ?? 0;
      } catch {
        /* ignore */
      }
    }

    if (hostResult.status === 'fulfilled' && hostResult.value.ok) {
      try {
        const body = (await hostResult.value.json()) as { is_host?: boolean };
        hostMode = body.is_host === true;
      } catch {
        /* ignore */
      }
    }

    return { inboxCount, hostMode };
  }
}
