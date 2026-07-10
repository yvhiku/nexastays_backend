import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import * as express from 'express';
import { AuthService, type AdaptiveRiskDecision } from './auth.service';
import {
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  VerifyPinDto,
  SetPinDto,
  CompleteRegistrationDto,
  SelectAccountDto,
} from './dto/auth.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RefreshDto, LogoutDto } from './dto/refresh.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { normalizePhoneOrThrow } from '../../common/phone/phone-normalizer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OtpSendRateLimitGuard } from './guards/otp-send-rate-limit.guard';
import { OtpVerifyRateLimitGuard } from './guards/otp-verify-rate-limit.guard';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../../common/metrics';
import type { RiskAuthAssessment } from '../../common/middleware/risk_auth.middleware';
import { BotProtectionGuard } from '../../common/abuse/bot-protection.guard';
import { AUTH_THROTTLE } from '../../common/abuse/throttle-presets';
import { SecurityEventsService } from '../security-events/security-events.service';
import { noteAuthFailure } from '../../common/security/security-traffic';
import { safeLogger } from '../../common/logging/safe-logger';

function getClientIp(req: express.Request): string {
  return (
    (req as express.Request & { ip?: string }).ip ||
    (req.connection as { remoteAddress?: string } | undefined)?.remoteAddress ||
    (typeof req.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : '') ||
    '0.0.0.0'
  );
}

@ApiTags('Pay Auth')
@Controller(['auth', 'pay/auth'])
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  @Post('login')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: express.Request) {
    const phone = normalizePhoneOrThrow(body.phone_number);
    const user = await this.authService.findUserByPhone(phone);
    if (!user) {
      noteAuthFailure(req, { reason: 'USER_NOT_FOUND' });
      void this.securityEvents
        .logEvent({
          event_type: 'AUTH_FAILURE',
          metadata: { reason: 'USER_NOT_FOUND', flow: 'login_lookup' },
          ip_address: getClientIp(req),
        })
        .catch(() => {});
      throw new NotFoundException('User not found');
    }
    // Never return pin_hash or other secrets — existence check only
    return {
      exists: true,
      account_type: user.account_type,
      kyc_status: user.kyc_status,
      status: user.status,
    };
  }

  @Post('send-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BotProtectionGuard, OtpSendRateLimitGuard)
  @Throttle(AUTH_THROTTLE)
  async sendOtp(@Body() body: SendOtpDto) {
    const phone = normalizePhoneOrThrow(body.phone_number);
    await this.authService.sendOtp(phone);
    this.metricsService.incrementOtpSend();
    return { sent: true };
  }

  @Post('otp/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BotProtectionGuard, OtpSendRateLimitGuard)
  @Throttle(AUTH_THROTTLE)
  async sendOtpV2(@Body() body: SendOtpDto) {
    const phone = normalizePhoneOrThrow(body.phone_number);
    await this.authService.sendOtp(phone);
    this.metricsService.incrementOtpSend();
    return { sent: true };
  }

  @Post('verify-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BotProtectionGuard, OtpVerifyRateLimitGuard)
  @Throttle(AUTH_THROTTLE)
  async verifyOtp(@Body() body: VerifyOtpDto, @Req() req: express.Request) {
    const ip = getClientIp(req);
    const phone = normalizePhoneOrThrow(body.phone_number);
    const verified = await this.authService.verifyOtp(phone, body.otp, ip);
    if (!verified.verified) this.metricsService.incrementOtpVerifyFailure();
    return { verified: verified.verified };
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BotProtectionGuard, OtpVerifyRateLimitGuard)
  @Throttle(AUTH_THROTTLE)
  async verifyOtpV2(@Body() body: VerifyOtpDto, @Req() req: express.Request) {
    const ip = getClientIp(req);
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip,
    };
    const phone = normalizePhoneOrThrow(body.phone_number);
    const result = await this.authService.verifyOtp(
      phone,
      body.otp,
      ip,
      ctx,
      { registration_role: body.registration_role, account_id: body.account_id },
    );
    if (!result.verified) this.metricsService.incrementOtpVerifyFailure();
    return result;
  }

  @Post('account/select')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange identity session for account-scoped JWT',
  })
  @ApiResponse({ status: 200, description: 'access_token and refresh_token' })
  @ApiResponse({ status: 401, description: 'Invalid identity session' })
  async selectAccount(
    @Body() body: SelectAccountDto,
    @Req() req: express.Request,
  ) {
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    return this.authService.selectAccount(
      body.identity_session_token,
      body.account_id,
      ctx,
    );
  }

  @Post('registration/complete')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async completeRegistration(
    @Body() body: CompleteRegistrationDto,
    @Req() req: express.Request,
  ) {
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    const result = await this.authService.completeRegistration(
      body.otp_session_token,
      ctx,
    );
    if (!result) {
      throw new UnauthorizedException(
        'Invalid or expired session. Complete KYC first.',
      );
    }
    return result;
  }

  @Post('pin/set')
  @Public() // Uses OTP session token instead of JWT
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async setPin(@Body() body: SetPinDto, @Req() req: express.Request) {
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    await this.authService.setPin(body.otp_session_token, body.pin, ctx);
    return { success: true };
  }

  @Post('verify-pin')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async verifyPin(@Body() body: VerifyPinDto, @Req() req: express.Request) {
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    const riskDecision = this.getRiskDecision(req);
    try {
      const phone = normalizePhoneOrThrow(body.phone_number);
      const result = await this.authService.verifyPin(
        phone,
        body.pin,
        body.account_type,
        ctx,
        riskDecision,
      );
      if (result.verified && result.access_token && result.user_id) {
        await this.auditService
          .audit({
            actorUserId: result.user_id,
            action: 'LOGIN_SUCCESS',
            targetType: 'USER',
            targetId: result.user_id,
            metadata: {
              ip: ctx.ip ?? null,
              country:
                (req.headers['cf-ipcountry'] as string) ||
                (req.headers['x-country-code'] as string) ||
                null,
              device_fingerprint:
                (req as express.Request & { risk_auth?: RiskAuthAssessment })
                  .risk_auth?.context.device_fingerprint ?? null,
              adaptive_risk_score: riskDecision?.risk_score ?? 0,
              adaptive_risk_level: riskDecision?.level ?? 'LOW',
            },
            req,
          })
          .catch(() => {});
      }
      return result;
    } catch (error) {
      await this.auditPinFailure(error, req);
      throw error;
    }
  }

  @Post('pin/verify')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async verifyPinV2(@Body() body: VerifyPinDto, @Req() req: express.Request) {
    const ctx = {
      device_id: (req.headers['x-device-id'] as string) || undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    const riskDecision = this.getRiskDecision(req);
    try {
      const phone = normalizePhoneOrThrow(body.phone_number);
      const result = await this.authService.verifyPin(
        phone,
        body.pin,
        body.account_type,
        ctx,
        riskDecision,
      );
      if (result.verified && result.access_token && result.user_id) {
        await this.auditService
          .audit({
            actorUserId: result.user_id,
            action: 'LOGIN_SUCCESS',
            targetType: 'USER',
            targetId: result.user_id,
            metadata: {
              ip: ctx.ip ?? null,
              country:
                (req.headers['cf-ipcountry'] as string) ||
                (req.headers['x-country-code'] as string) ||
                null,
              device_fingerprint:
                (req as express.Request & { risk_auth?: RiskAuthAssessment })
                  .risk_auth?.context.device_fingerprint ?? null,
              adaptive_risk_score: riskDecision?.risk_score ?? 0,
              adaptive_risk_level: riskDecision?.level ?? 'LOW',
            },
            req,
          })
          .catch(() => {});
      }
      return result;
    } catch (error) {
      await this.auditPinFailure(error, req);
      throw error;
    }
  }

  private async auditPinFailure(
    error: unknown,
    req: express.Request,
  ): Promise<void> {
    if (!(error instanceof HttpException)) return;
    const response = error.getResponse();
    const payload =
      typeof response === 'string'
        ? { message: response }
        : (response as Record<string, unknown>);
    const code = typeof payload.code === 'string' ? payload.code : '';
    if (
      code !== 'PIN_INVALID' &&
      code !== 'PIN_LOCKED_OUT' &&
      code !== 'NEW_DEVICE_VERIFICATION_REQUIRED' &&
      code !== 'STEP_UP_OTP_REQUIRED' &&
      code !== 'RISK_REVIEW_REQUIRED'
    ) {
      return;
    }
    await this.auditService
      .audit({
        action:
          code === 'PIN_LOCKED_OUT'
            ? 'PIN_LOCKOUT'
            : code === 'NEW_DEVICE_VERIFICATION_REQUIRED'
              ? 'NEW_DEVICE_VERIFICATION_REQUIRED'
              : code === 'STEP_UP_OTP_REQUIRED'
                ? 'STEP_UP_OTP_REQUIRED'
                : code === 'RISK_REVIEW_REQUIRED'
                  ? 'STEP_UP_BLOCKED_MANUAL_REVIEW'
                  : 'PIN_VERIFY_FAILED',
        targetType: 'USER',
        targetId:
          typeof payload.account_id === 'string'
            ? payload.account_id
            : undefined,
        metadata: {
          code,
          attempts_remaining:
            typeof payload.attempts_remaining === 'number'
              ? payload.attempts_remaining
              : undefined,
          retry_after_seconds:
            typeof payload.retry_after_seconds === 'number'
              ? payload.retry_after_seconds
              : undefined,
        },
        req,
      })
      .catch(() => {});
  }

  private getRiskDecision(
    req: express.Request,
  ): AdaptiveRiskDecision | undefined {
    const riskAuth = (
      req as express.Request & { risk_auth?: RiskAuthAssessment }
    ).risk_auth;
    if (!riskAuth) return undefined;
    return {
      risk_score: riskAuth.risk_score,
      level: riskAuth.level,
      reason_codes: riskAuth.reason_codes,
    };
  }

  @Post('refresh')
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    default: { limit: 30, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using a valid refresh token (rotating)',
  })
  @ApiResponse({
    status: 200,
    description: 'New access_token and refresh_token returned',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() body: RefreshDto, @Req() req: express.Request) {
    const ctx = {
      device_id:
        body.device_id ?? (req.headers['x-device-id'] as string) ?? undefined,
      user_agent: req.headers['user-agent'] || undefined,
      ip: getClientIp(req),
    };
    const result = await this.authService.refresh(body.refresh_token, ctx);
    await this.auditService
      .audit({
        action: 'REFRESH_TOKEN_USE',
        targetType: 'USER',
        req,
      })
      .catch(() => {});
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Revoke refresh token(s) for this device or all devices',
  })
  @ApiResponse({ status: 200, description: 'Tokens revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: { userId: string },
    @Body() body?: LogoutDto,
    @Req() req?: express.Request,
  ) {
    await this.authService.revokeRefreshTokens(
      user.userId,
      body?.device_id ?? undefined,
    );
    await this.auditService
      .audit({
        actorUserId: user.userId,
        action: 'LOGOUT',
        targetType: 'USER',
        targetId: user.userId,
        req: req ?? undefined,
      })
      .catch(() => {});
    return { success: true };
  }

  @Post('admin/login')
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    default: { limit: 5, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() body: AdminLoginDto, @Req() req: express.Request) {
    const ip =
      (req as express.Request & { ip?: string }).ip ??
      req.socket?.remoteAddress ??
      '0.0.0.0';
    const result = await this.authService.adminLogin(body.email, body.password, ip);
    if (!result) {
      noteAuthFailure(req, { reason: 'ADMIN_LOGIN_FAILURE' });
      safeLogger.info('security.admin_login_failure', {
        ip,
        email: body.email?.slice(0, 3) + '***',
      });
      void this.securityEvents
        .logEvent({
          event_type: 'ADMIN_LOGIN_FAILURE',
          metadata: { flow: 'admin_login' },
          ip_address: ip,
        })
        .catch(() => {});
      throw new UnauthorizedException('Invalid email or password');
    }
    safeLogger.info('security.admin_login_success', { ip });
    return result;
  }
}
