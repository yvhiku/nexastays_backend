import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../../common/config/app.config';
import { User } from '../users/entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { OtpSession } from './entities/otp-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TrustedDevice } from './entities/trusted-device.entity';
import { OtpLockoutService } from './otp-lockout.service';
import { PinLockoutService } from './pin-lockout.service';
import { UsersService } from '../users/users.service';
import { UnifiedIdentityService } from '../users/unified-identity.service';
import { KycReuseService } from '../users/kyc-reuse.service';
import type { AccountType } from '../users/entities/user.entity';
import { safeLogger } from '../../common/logging/safe-logger';
import { hashPin, verifyPinHash } from '../../common/security/pin-hasher';
import { SmsService } from '../sms/sms.service';
import { normalizePhoneOrThrow, tryNormalizePhoneNumber, phoneLookupCandidates } from '../../common/phone/phone-normalizer';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';

export interface RefreshTokenContext {
  device_id?: string | null;
  user_agent?: string | null;
  ip?: string | null;
}

export interface AdaptiveRiskDecision {
  risk_score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  reason_codes: string[];
}

type RefreshRotationResult = {
  access_token: string;
  expires_in: string;
  refresh_token: string;
  account_type: string;
};

@Injectable()
export class AuthService {
  /** Coalesce concurrent refresh calls with the same token so the second does not hit reuse detection. */
  private readonly refreshInFlight = new Map<string, Promise<RefreshRotationResult>>();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
    @InjectRepository(OtpSession)
    private readonly otpSessionRepository: Repository<OtpSession>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepository: Repository<TrustedDevice>,
    private readonly otpLockoutService: OtpLockoutService,
    private readonly pinLockoutService: PinLockoutService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly unifiedIdentityService: UnifiedIdentityService,
    private readonly kycReuseService: KycReuseService,
    private readonly smsService: SmsService,
    @InjectRepository(KycProfile)
    private readonly kycProfileRepository: Repository<KycProfile>,
  ) {}

  private normalizedDeviceName(userAgent?: string | null): string | null {
    const normalized = (userAgent || '').trim();
    if (!normalized) return null;
    return normalized.slice(0, 120);
  }

  private async upsertTrustedDevice(params: {
    userId: string;
    deviceId?: string | null;
    deviceName?: string | null;
    trusted: boolean;
  }): Promise<void> {
    const rawDeviceId = (params.deviceId || '').trim();
    if (!rawDeviceId) return;
    const deviceId = rawDeviceId.slice(0, 120);
    const now = new Date();
    const existing = await this.trustedDeviceRepository.findOne({
      where: { user_id: params.userId, device_id: deviceId },
    });
    if (!existing) {
      await this.trustedDeviceRepository.save({
        user_id: params.userId,
        device_id: deviceId,
        device_name: this.normalizedDeviceName(params.deviceName),
        trusted: params.trusted,
        first_seen_at: now,
        last_seen_at: now,
      });
      return;
    }
    existing.last_seen_at = now;
    existing.device_name =
      this.normalizedDeviceName(params.deviceName) ?? existing.device_name;
    if (params.trusted) existing.trusted = true;
    await this.trustedDeviceRepository.save(existing);
  }

  private async isTrustedDevice(
    userId: string,
    deviceId?: string | null,
  ): Promise<boolean> {
    const normalized = (deviceId || '').trim();
    if (!normalized) return false;
    const trusted = await this.trustedDeviceRepository.findOne({
      where: {
        user_id: userId,
        device_id: normalized.slice(0, 120),
        trusted: true,
      },
    });
    return !!trusted;
  }

  private hashRefreshToken(plain: string): string {
    return crypto
      .createHmac('sha256', appConfig.refreshTokenPepper)
      .update(plain)
      .digest('hex');
  }

  private createRefreshTokenPlain(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  /**
   * Issue stateless identity JWT — auth/authorization only.
   * KYC/compliance data is served via GET /snapshots/me (cached), not embedded in tokens.
   */
  issueAccountScopedToken(
    accountId: string,
    unifiedIdentityId: string,
    accountType: string,
    authMethod: 'otp_pin' | 'pin_only' | 'otp_only' = 'otp_pin',
    sessionId?: string,
    profile?: {
      role?: string;
      roles?: string[];
    },
  ): string {
    return this.jwtService.sign(
      {
        sub: accountId,
        unified_identity_id: unifiedIdentityId,
        account_type: accountType,
        session_id: sessionId ?? undefined,
        auth_method: authMethod,
        role: profile?.role,
        roles: profile?.roles,
      },
      { expiresIn: appConfig.jwtExpiresIn } as any,
    );
  }

  private async tokenProfileForUser(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return undefined;
    const kyc = await this.kycProfileRepository.findOne({
      where: { user_id: userId },
    });
    const kyc_status = kyc?.status ?? user.kyc_status ?? null;
    const kyc_tier = kyc?.level ?? null;
    return {
      phone_number: user.phone_number,
      email: user.email,
      kyc_status,
      kyc_tier,
      kyc_provider: kyc?.provider ?? null,
      kyc_updated_at: kyc?.reviewed_at ?? kyc?.last_webhook_received_at ?? null,
      role: user.account_type === 'ADMIN' ? 'ADMIN' : undefined,
      roles: user.account_type === 'ADMIN' ? ['ADMIN'] : undefined,
    };
  }

  /** Issue a new refresh token for user; returns plain token (caller must not log it). */
  async issueRefreshToken(
    userId: string,
    ctx: RefreshTokenContext,
  ): Promise<{ refresh_token: string; expires_at: Date }> {
    const plain = this.createRefreshTokenPlain();
    const hash = this.hashRefreshToken(plain);
    const expiresAt = new Date(
      Date.now() + appConfig.refreshTokenExpiresIn * 1000,
    );
    await this.refreshTokenRepository.save({
      user_id: userId,
      token_hash: hash,
      device_id: ctx.device_id ?? null,
      user_agent: ctx.user_agent ?? null,
      ip: ctx.ip ?? null,
      expires_at: expiresAt,
    });
    return { refresh_token: plain, expires_at: expiresAt };
  }

  /**
   * Verify refresh token, revoke it, and issue new access + refresh (rotation).
   * If the token was already revoked (reuse), revoke all tokens for that user (family).
   */
  async refresh(
    refreshTokenPlain: string,
    ctx: RefreshTokenContext,
  ): Promise<RefreshRotationResult> {
    const key = this.hashRefreshToken(refreshTokenPlain);
    const existing = this.refreshInFlight.get(key);
    if (existing) {
      return existing;
    }
    const p = this.rotateRefreshToken(refreshTokenPlain, ctx).finally(() => {
      this.refreshInFlight.delete(key);
    });
    this.refreshInFlight.set(key, p);
    return p;
  }

  private async rotateRefreshToken(
    refreshTokenPlain: string,
    ctx: RefreshTokenContext,
  ): Promise<RefreshRotationResult> {
    const hash = this.hashRefreshToken(refreshTokenPlain);
    const row = await this.refreshTokenRepository.findOne({
      where: { token_hash: hash },
    });
    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revoked_at) {
      await this.revokeAllForUser(row.user_id);
      throw new UnauthorizedException(
        'Refresh token was reused; all sessions revoked',
      );
    }
    if (row.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (ctx.device_id && row.device_id && row.device_id !== ctx.device_id) {
      throw new UnauthorizedException('Device mismatch');
    }

    const user = await this.userRepository.findOne({
      where: { id: row.user_id },
      select: ['id', 'account_type', 'unified_identity_id', 'phone_number'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    row.revoked_at = new Date();
    await this.refreshTokenRepository.save(row);

    const { refresh_token: newRefresh } = await this.issueRefreshToken(
      row.user_id,
      {
        device_id: ctx.device_id ?? row.device_id,
        user_agent: ctx.user_agent ?? row.user_agent,
        ip: ctx.ip ?? row.ip,
      },
    );
    let identityId = user.unified_identity_id ?? null;
    if (!identityId && user.phone_number) {
      identityId = (await this.unifiedIdentityService.findOrCreateByPhone(user.phone_number))
        .id;
    }
    if (!identityId && user.account_type === 'ADMIN') {
      identityId = await this.unifiedIdentityService.ensureIdentityForAdminUser(user.id);
    }
    if (!identityId) {
      throw new UnauthorizedException('User identity not found');
    }
    const access_token = this.issueAccountScopedToken(
      user.id,
      identityId,
      user.account_type ?? 'CONSUMER',
      'otp_pin',
      undefined,
      await this.tokenProfileForUser(user.id),
    );
    return {
      access_token,
      expires_in: appConfig.jwtExpiresIn,
      refresh_token: newRefresh,
      account_type: (user.account_type ?? 'CONSUMER') as string,
    };
  }

  /** Revoke refresh token(s): by device_id or all for user. */
  /** Admin dashboards list KYC from kyc_profiles; keep row VERIFIED without phone onboarding. */
  private async ensureAdminVerifiedKycRow(
    userId: string,
    adminEmail: string,
  ): Promise<void> {
    const reviewedBy = `admin:${adminEmail}`;
    const now = new Date();
    let row = await this.kycProfileRepository.findOne({ where: { user_id: userId } });
    if (!row) {
      row = this.kycProfileRepository.create({
        user_id: userId,
        level: 'TIER_2',
        status: 'VERIFIED',
        provider: 'ADMIN',
        reviewed_at: now,
        reviewed_by: reviewedBy,
      });
      await this.kycProfileRepository.save(row);
      return;
    }
    row.status = 'VERIFIED';
    if (!row.level || row.level === 'NONE') row.level = 'TIER_2';
    row.reviewed_at = now;
    row.reviewed_by = reviewedBy;
    await this.kycProfileRepository.save(row);
  }

  async revokeRefreshTokens(
    userId: string,
    deviceId?: string | null,
  ): Promise<void> {
    const qb = this.refreshTokenRepository
      .createQueryBuilder('r')
      .where('r.user_id = :userId', { userId })
      .andWhere('r.revoked_at IS NULL');
    if (deviceId) {
      qb.andWhere('r.device_id = :deviceId', { deviceId });
    }
    const rows = await qb.getMany();
    const now = new Date();
    for (const r of rows) {
      r.revoked_at = now;
    }
    if (rows.length) {
      await this.refreshTokenRepository.save(rows);
    }
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { user_id: userId },
      { revoked_at: new Date() },
    );
  }

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    const candidates = phoneLookupCandidates(phoneNumber);
    if (candidates.length === 0) return null;
    return this.userRepository.findOne({
      where: candidates.map((phone_number) => ({ phone_number })),
    });
  }

  async findConsumerByPhone(phoneNumber: string): Promise<User | null> {
    const candidates = phoneLookupCandidates(phoneNumber);
    if (candidates.length === 0) return null;
    return this.userRepository.findOne({
      where: candidates.map((phone_number) => ({
        phone_number,
        account_type: 'CONSUMER',
      })),
    });
  }

  /** All accounts for this phone (identity). */
  async findAccountsByPhone(
    phoneNumber: string,
  ): Promise<Array<{ id: string; account_type: string }>> {
    const candidates = phoneLookupCandidates(phoneNumber);
    if (candidates.length === 0) return [];
    const rows = await this.userRepository.find({
      where: candidates.map((phone_number) => ({ phone_number })),
      select: ['id', 'account_type'],
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .map((r) => ({
        id: r.id,
        account_type: (r.account_type ?? 'CONSUMER') as string,
      }));
  }

  async sendOtp(phoneNumber: string): Promise<void> {
    const norm = normalizePhoneOrThrow(phoneNumber);
    const expiresAt = new Date(Date.now() + appConfig.otpExpirySeconds * 1000);
    const isDemoOtp = !!appConfig.demoOtpCode;
    const otpCode = isDemoOtp
      ? appConfig.demoOtpCode
      : crypto.randomInt(100000, 999999).toString();
    await this.otpRepository.save({
      phone_number: norm,
      code: otpCode,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
    });
    if (!isDemoOtp) {
      const smsSent = await this.smsService.sendOtp(norm, otpCode);
      if (!smsSent) {
        safeLogger.error('Failed to send OTP SMS', null, { phoneNumber: norm });
      }
      safeLogger.debug('OTP issued', { phoneNumber: norm, smsSent });
    } else {
      safeLogger.debug('OTP issued (demo code, SMS skipped)', { phoneNumber: norm });
    }
  }

  async verifyOtp(
    phoneNumber: string,
    otp: string,
    ip: string = '0.0.0.0',
    ctx?: RefreshTokenContext,
    options?: { registration_role?: string; account_id?: string },
  ): Promise<{
    verified: boolean;
    otp_session_token?: string;
    identity_session_token?: string;
    accounts?: Array<{ id: string; account_type: string }>;
    nexa_profile?: {
      exists: boolean;
      full_name?: string | null;
      email?: string | null;
      date_of_birth?: string | null;
      city?: string | null;
      address?: string | null;
      kyc_status?: string;
      identity_verified: boolean;
      linked_services: string[];
    };
    kyc_reuse?: {
      use_existing_kyc: boolean;
      can_skip_identity_step: boolean;
      can_prefill_identity_readonly: boolean;
      require_step_up_verification: boolean;
      identity_verified_banner: boolean;
    };
    access_token?: string;
    refresh_token?: string;
    expires_in?: string;
  }> {
    const norm = normalizePhoneOrThrow(phoneNumber);
    const submitted = (otp ?? '').trim();
    const demoBypass =
      appConfig.env !== 'production' &&
      !!appConfig.demoOtpCode &&
      submitted === appConfig.demoOtpCode;

    // Dev: DEMO_OTP_CODE lets testers recover after lockout / consumed OTP / wrong stored code.
    if (!demoBypass) {
      if (await this.otpLockoutService.isLockedOut(norm, ip)) {
        throw new BadRequestException('Too many attempts. Try again later.');
      }
    }

    const record = await this.otpRepository.findOne({
      where: { phone_number: norm },
      order: { created_at: 'DESC' },
    });
    if (!record) {
      if (!demoBypass) {
        await this.otpLockoutService.recordFailure(norm, ip);
      }
      return { verified: false };
    }
    if (!demoBypass) {
      if (record.consumed_at) {
        await this.otpLockoutService.recordFailure(norm, ip);
        return { verified: false };
      }
      if (record.expires_at.getTime() < Date.now()) {
        return { verified: false };
      }
      if (submitted !== (record.code ?? '').trim()) {
        await this.otpLockoutService.recordFailure(norm, ip);
        record.attempts += 1;
        if (record.attempts >= 5) {
          record.consumed_at = new Date();
        }
        await this.otpRepository.save(record);
        return { verified: false };
      }
    }

    await this.otpLockoutService.recordSuccess(norm, ip);
    record.consumed_at = new Date();
    await this.otpRepository.save(record);

    const identity = await this.unifiedIdentityService.findOrCreateByPhone(norm);
    let accounts = await this.findAccountsByPhone(norm);
    // Nexa ecosystem: first verified OTP on a phone must yield a usable account for any consumer
    // app (Stays, Pay, Go) without forcing signup in another product first.
    const hasConsumer = accounts.some(
      (a) => (a.account_type ?? '').toUpperCase() === 'CONSUMER',
    );
    if (!hasConsumer) {
      await this.usersService.findOrCreateForKyc(norm);
      accounts = await this.findAccountsByPhone(norm);
    }
    const consumer = await this.findConsumerByPhone(norm);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const otpSessionMinutes = 120;
    const expiresAt = new Date(Date.now() + otpSessionMinutes * 60 * 1000);

    await this.otpSessionRepository.save({
      phone_number: norm,
      user_id:
        consumer?.id ??
        (accounts.length === 1 && accounts[0].account_type === 'CONSUMER'
          ? accounts[0].id
          : null),
      session_token: sessionToken,
      expires_at: expiresAt,
      consumed: false,
    });

    const identitySessionJwt = this.jwtService.sign(
      {
        sub: sessionToken,
        phone_number: norm,
        type: 'identity_session',
        unified_identity_id: identity.id,
      },
      { expiresIn: `${otpSessionMinutes}m` },
    );

    const targetAccountId = (options as { account_id?: string })?.account_id;
    const targetAccount = targetAccountId
      ? accounts.find((a) => a.id === targetAccountId)
      : null;
    // Do not require findConsumerByPhone: legacy rows may have account_type NULL in DB while
    // findAccountsByPhone maps them to CONSUMER — consumer would be null and we'd skip issuing JWT.
    const autoSelectConsumer =
      !targetAccountId &&
      accounts.length === 1 &&
      accounts[0].account_type === 'CONSUMER';
    const autoSelectDriverOrCourier =
      !targetAccountId &&
      accounts.length === 1 &&
      (accounts[0].account_type === 'DRIVER' || accounts[0].account_type === 'COURIER');

    const requestedRole = (options?.registration_role as string | undefined)?.toLowerCase();
    const preferredByRole =
      !targetAccountId &&
      (requestedRole === 'driver' || requestedRole === 'courier')
        ? accounts.find(
            (a) => a.account_type === (requestedRole === 'driver' ? 'DRIVER' : 'COURIER'),
          ) ?? null
        : null;

    let selected =
      targetAccount ??
      (autoSelectConsumer
        ? { id: accounts[0].id, account_type: 'CONSUMER' }
        : null) ??
      (autoSelectDriverOrCourier ? accounts[0]! : null) ??
      preferredByRole;

    // Nexa Pay (and other consumer apps): when multiple role accounts share a phone
    // and the client did not pass account_id / registration_role, prefer CONSUMER
    // so OTP verify returns access_token + nexa_profile instead of trapping users in KYC.
    if (
      !selected &&
      !targetAccountId &&
      !requestedRole &&
      accounts.length > 0
    ) {
      selected =
        accounts.find(
          (a) =>
            (a.account_type ?? 'CONSUMER').toUpperCase() === 'CONSUMER',
        ) ?? null;
    }

    if (selected) {
      const accessToken = this.issueAccountScopedToken(
        selected.id,
        identity.id,
        selected.account_type,
        'otp_pin',
        undefined,
        await this.tokenProfileForUser(selected.id),
      );
      const { refresh_token } = await this.issueRefreshToken(selected.id, ctx ?? { ip });
      await this.upsertTrustedDevice({
        userId: selected.id,
        deviceId: ctx?.device_id,
        deviceName: ctx?.user_agent,
        trusted: true,
      });
      return {
        verified: true,
        otp_session_token: identitySessionJwt,
        identity_session_token: identitySessionJwt,
        accounts,
        nexa_profile: (await this.usersService.getNexaProfileByPhone(norm)) ?? undefined,
        access_token: accessToken,
        refresh_token,
        expires_in: appConfig.jwtExpiresIn,
      };
    }

    let kycReuse: {
      use_existing_kyc: boolean;
      can_skip_identity_step: boolean;
      can_prefill_identity_readonly: boolean;
      require_step_up_verification: boolean;
      identity_verified_banner: boolean;
    } | undefined;

    if (options?.registration_role && (options.registration_role === 'driver' || options.registration_role === 'courier')) {
      try {
        const service = options.registration_role === 'driver' ? 'DRIVER' : 'COURIER';
        const result = await this.kycReuseService.useExistingKyc(identity.id, service);
        kycReuse = {
          use_existing_kyc: result.useExistingKyc,
          can_skip_identity_step: result.canSkipIdentityStep,
          can_prefill_identity_readonly: result.canPrefillIdentityReadonly,
          require_step_up_verification: result.requireStepUpVerification,
          identity_verified_banner:
            result.useExistingKyc ||
            (result.canPrefillIdentityReadonly &&
              result.verification != null &&
              (result.verification.verification_status === 'APPROVED' ||
                result.verification.kyc_status === 'VERIFIED')),
        };
      } catch (err) {
        safeLogger.info('KYC reuse lookup failed (non-fatal)', {
          phoneNumber: norm,
          err: String((err as Error)?.message ?? err),
        });
      }
    }

    return {
      verified: true,
      otp_session_token: identitySessionJwt,
      identity_session_token: identitySessionJwt,
      accounts,
      nexa_profile: (await this.usersService.getNexaProfileByPhone(norm)) ?? undefined,
      kyc_reuse: kycReuse,
      expires_in: `${otpSessionMinutes}m`,
    };
  }

  /**
   * Exchange identity_session_token for account-scoped JWT.
   * Validates that account_id belongs to the identity.
   */
  async selectAccount(
    identitySessionToken: string,
    accountId: string,
    ctx?: RefreshTokenContext,
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: string;
    account_type: string;
    account_id: string;
  }> {
    let payload: { sub?: string; type?: string; unified_identity_id?: string; phone_number?: string };
    try {
      payload = this.jwtService.verify(identitySessionToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired identity session token');
    }

    if (payload.type !== 'identity_session' && payload.type !== 'otp_session') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.otpSessionRepository.findOne({
      where: { session_token: payload.sub },
    });
    if (
      !session ||
      session.consumed ||
      session.expires_at.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Identity session expired or already used');
    }

    const identityId = payload.unified_identity_id;
    if (!identityId) {
      const identity = await this.unifiedIdentityService.findOrCreateByPhone(session.phone_number);
      (payload as any).unified_identity_id = identity.id;
    }

    const accounts = await this.findAccountsByPhone(session.phone_number);
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new BadRequestException(
        `Account ${accountId} not found for this identity. Available: ${accounts.map((a) => a.account_type).join(', ')}`,
      );
    }

    session.consumed = true;
    await this.otpSessionRepository.save(session);

    const unifiedIdentityId = (payload.unified_identity_id ?? (await this.unifiedIdentityService.findOrCreateByPhone(session.phone_number)).id) as string;
    const accessToken = this.issueAccountScopedToken(
      account.id,
      unifiedIdentityId,
      account.account_type,
      'otp_pin',
      undefined,
      await this.tokenProfileForUser(account.id),
    );
    const { refresh_token } = await this.issueRefreshToken(account.id, ctx ?? { ip: '0.0.0.0' });
    await this.upsertTrustedDevice({
      userId: account.id,
      deviceId: ctx?.device_id,
      deviceName: ctx?.user_agent,
      trusted: true,
    });

    return {
      access_token: accessToken,
      refresh_token,
      expires_in: appConfig.jwtExpiresIn,
      account_type: account.account_type,
      account_id: account.id,
    };
  }

  async setPin(
    otpSessionToken: string,
    pin: string,
    ctx?: RefreshTokenContext,
  ): Promise<void> {
    let payload: any;
    try {
      payload = this.jwtService.verify(otpSessionToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired OTP session token');
    }

    if (payload.type !== 'otp_session' && payload.type !== 'identity_session') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.otpSessionRepository.findOne({
      where: { session_token: payload.sub },
    });

    if (
      !session ||
      session.consumed ||
      session.expires_at.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('OTP session expired or already used');
    }

    session.consumed = true;
    await this.otpSessionRepository.save(session);

    const consumer = await this.findConsumerByPhone(session.phone_number);
    if (!consumer) {
      await this.usersService.createUser({
        phone_number: session.phone_number,
        pin,
      });
      const created = await this.findConsumerByPhone(session.phone_number);
      if (created && ctx?.device_id) {
        await this.upsertTrustedDevice({
          userId: created.id,
          deviceId: ctx.device_id,
          deviceName: ctx.user_agent,
          trusted: true,
        });
      }
      return;
    }
    consumer.pin_hash = await hashPin(pin);
    await this.userRepository.save(consumer);
    await this.pinLockoutService.recordSuccess(consumer.id);
    if (ctx?.device_id) {
      await this.upsertTrustedDevice({
        userId: consumer.id,
        deviceId: ctx.device_id,
        deviceName: ctx.user_agent,
        trusted: true,
      });
    }
  }

  async verifyPin(
    phoneNumber: string,
    pin: string,
    accountType?: string,
    ctx?: RefreshTokenContext,
    riskDecision?: AdaptiveRiskDecision,
  ) {
    const norm = normalizePhoneOrThrow(phoneNumber);
    const requested = (accountType ?? 'CONSUMER') as AccountType;
    let account = await this.userRepository.findOne({
      where: { phone_number: norm, account_type: requested },
      select: ['id', 'account_type', 'pin_hash', 'unified_identity_id'],
    });
    if (!account && norm !== phoneNumber) {
      account = await this.userRepository.findOne({
        where: { phone_number: phoneNumber, account_type: requested },
        select: ['id', 'account_type', 'pin_hash', 'unified_identity_id'],
      });
    }
    if (!account) {
      throw new BadRequestException(
        `No ${requested} account found for this phone number`,
      );
    }

    const lockoutStatus = await this.pinLockoutService.getStatus(account.id);
    if (lockoutStatus.locked) {
      throw new HttpException(
        {
          code: 'PIN_LOCKED_OUT',
          message: 'Too many PIN attempts. Try again later.',
          account_id: account.id,
          retry_after_seconds: lockoutStatus.retryAfterSeconds,
          locked_until: lockoutStatus.lockedUntil?.toISOString() ?? null,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const verifyResult = await verifyPinHash(pin, account.pin_hash);
    const valid = verifyResult.valid;
    if (!valid) {
      const failure = await this.pinLockoutService.recordFailure(account.id);
      if (failure.locked) {
        throw new HttpException(
          {
            code: 'PIN_LOCKED_OUT',
            message: 'Too many PIN attempts. Try again later.',
            account_id: account.id,
            retry_after_seconds: failure.retryAfterSeconds,
            locked_until: failure.lockedUntil?.toISOString() ?? null,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException({
        code: 'PIN_INVALID',
        message: 'Invalid PIN',
        account_id: account.id,
        attempts_remaining: failure.attemptsRemaining,
      });
    }

    if (verifyResult.needsRehash) {
      await this.userRepository.update(
        { id: account.id },
        { pin_hash: await hashPin(pin) },
      );
    }
    await this.pinLockoutService.recordSuccess(account.id);

    const accounts = await this.findAccountsByPhone(norm);
    const selectedAccount = accounts.find((a) => a.account_type === requested);
    if (!selectedAccount) {
      throw new BadRequestException(
        `No ${requested} account for this phone. Available: ${accounts.map((a) => a.account_type).join(', ') || 'none'}.`,
      );
    }

    const trustedDevice = await this.isTrustedDevice(
      selectedAccount.id,
      ctx?.device_id,
    );
    if (!trustedDevice) {
      await this.upsertTrustedDevice({
        userId: selectedAccount.id,
        deviceId: ctx?.device_id,
        deviceName: ctx?.user_agent,
        trusted: false,
      });
      throw new UnauthorizedException({
        code: 'NEW_DEVICE_VERIFICATION_REQUIRED',
        message: 'New device verification required. Please verify with OTP.',
        otp_required: true,
      });
    }
    await this.upsertTrustedDevice({
      userId: selectedAccount.id,
      deviceId: ctx?.device_id,
      deviceName: ctx?.user_agent,
      trusted: true,
    });

    if (riskDecision?.level === 'HIGH') {
      throw new HttpException(
        {
          code: 'RISK_REVIEW_REQUIRED',
          message:
            'Login blocked due to high risk signals. Manual review is required.',
          account_id: selectedAccount.id,
          risk_score: riskDecision.risk_score,
          reason_codes: riskDecision.reason_codes,
        },
        HttpStatus.FORBIDDEN,
      );
    }
    // MEDIUM adaptive-risk step-up (OTP) is for transfers, not PIN unlock on a
    // trusted device. New devices are handled above via NEW_DEVICE_VERIFICATION_REQUIRED.

    await this.userRepository.update(
      { id: selectedAccount.id },
      { last_login_at: new Date() },
    );

    const identityId = account?.unified_identity_id ?? (await this.unifiedIdentityService.findOrCreateByPhone(norm)).id;
    const token = this.issueAccountScopedToken(
      selectedAccount.id,
      identityId,
      selectedAccount.account_type ?? 'CONSUMER',
      'pin_only',
      undefined,
      await this.tokenProfileForUser(selectedAccount.id),
    );
    const result: {
      verified: boolean;
      access_token: string;
      expires_in: string;
      account_type: string;
      user_id?: string;
      refresh_token?: string;
    } = {
      verified: true,
      access_token: token,
      expires_in: appConfig.jwtExpiresIn,
      account_type: selectedAccount.account_type,
      user_id: selectedAccount.id,
    };
    if (ctx) {
      const { refresh_token } = await this.issueRefreshToken(
        selectedAccount.id,
        ctx,
      );
      result.refresh_token = refresh_token;
    }
    return result;
  }

  /**
   * Exchange OTP session for access token after KYC submission.
   * User must already exist (created by KYC submit). Consumes the OTP session.
   */
  async completeRegistration(
    otpSessionToken: string,
    ctx?: RefreshTokenContext,
  ): Promise<{ access_token: string; refresh_token: string; user_id: string } | null> {
    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(otpSessionToken);
    } catch {
      return null;
    }
    if (payload.type !== 'otp_session' && payload.type !== 'identity_session') return null;

    const session = await this.otpSessionRepository.findOne({
      where: { session_token: payload.sub },
    });
    if (
      !session ||
      session.consumed ||
      session.expires_at.getTime() < Date.now()
    ) {
      return null;
    }

    const consumer = await this.findConsumerByPhone(session.phone_number);
    if (!consumer) return null;

    const identity = await this.unifiedIdentityService.findOrCreateByPhone(session.phone_number);
    session.consumed = true;
    await this.otpSessionRepository.save(session);

    const accessToken = this.issueAccountScopedToken(
      consumer.id,
      identity.id,
      (consumer.account_type ?? 'CONSUMER') as string,
      'otp_pin',
      undefined,
      await this.tokenProfileForUser(consumer.id),
    );
    const { refresh_token } = await this.issueRefreshToken(
      consumer.id,
      ctx ?? { ip: '0.0.0.0' },
    );
    return {
      access_token: accessToken,
      refresh_token,
      user_id: consumer.id,
    };
  }

  async adminLogin(
    email: string,
    password: string,
  ): Promise<{ access_token: string; user: any } | null> {
    // For MVP: Check if email is in allowed admin emails (case-insensitive)
    // TODO: Add proper role field to User entity or create Admin entity
    const normalizedEmail = (email || '').trim().toLowerCase();
    const allowedEmails = appConfig.adminEmails;
    const isAdminEmail = allowedEmails.length > 0 && allowedEmails.includes(normalizedEmail);

    if (!isAdminEmail) {
      return null;
    }

    // For MVP: Simple password check (demo password is "admin123"); trim to avoid copy-paste issues
    // TODO: Store password hash in database and verify with bcrypt
    const configuredAdminPassword = appConfig.adminPassword;
    if (!configuredAdminPassword) {
      safeLogger.error('Admin login is disabled: ADMIN_PASSWORD is not set');
      return null;
    }
    const validPassword = (password || '').trim() === configuredAdminPassword;

    if (!validPassword) {
      return null;
    }

    const adminEmail = normalizedEmail;
    let user = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    const now = new Date();
    const randomPin = await hashPin(crypto.randomUUID());

    if (!user) {
      user = await this.userRepository.save({
        phone_number: null,
        email: adminEmail,
        full_name: 'Admin User',
        pin_hash: randomPin,
        status: 'ACTIVE',
        kyc_status: 'APPROVED',
        account_type: 'ADMIN',
      });
    } else {
      if (user.account_type !== 'ADMIN') user.account_type = 'ADMIN';
      user.phone_number = null;
      user.kyc_status = 'APPROVED';
      await this.userRepository.save(user);
    }

    await this.unifiedIdentityService.ensureIdentityForAdminUser(user.id);

    await this.ensureAdminVerifiedKycRow(user.id, adminEmail);

    user.last_login_at = now;
    await this.userRepository.save(user);

    const token = this.issueAccountScopedToken(
      user.id,
      (await this.unifiedIdentityService.ensureIdentityForAdminUser(user.id)) ??
        user.id,
      'ADMIN',
      'pin_only',
      undefined,
      {
        role: 'ADMIN',
        roles: ['ADMIN'],
      },
    );

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: 'ADMIN',
        roles: ['ADMIN'],
      },
    };
  }
}
