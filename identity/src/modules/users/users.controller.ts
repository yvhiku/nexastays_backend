import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  NotFoundException,
  UploadedFile,
  Param,
  Req,
  Logger,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePhoneDto } from './dto/change-phone.dto';
import {
  RegisterPushTokenDto,
  UpdatePushPreferenceDto,
} from './dto/push-token.dto';
import {
  AcceptMandatoryConsentsDto,
  UpdateMarketingConsentDto,
} from './dto/consent.dto';
import { DataExportDto, DeletionRequestDto } from './dto/data-rights.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { OtpSessionResolverGuard } from '../../common/guards/otp-session-resolver.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { DbCircuitBreakerGuard } from '../../common/guards/db-circuit-breaker.guard';
import { HttpCacheInterceptor } from '../../common/cache/http-cache.interceptor';
import { CacheTTL } from '../../common/cache/cache-ttl.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { AuditService } from '../audit/audit.service';
import { BotProtectionGuard } from '../../common/abuse/bot-protection.guard';
import { ACCOUNT_CREATE_THROTTLE } from '../../common/abuse/throttle-presets';

@ApiTags('Pay Users')
@Controller(['users', 'pay/users'])
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @UseGuards(BotProtectionGuard)
  @Throttle(ACCOUNT_CREATE_THROTTLE)
  async createUser(@Body() body: CreateUserDto) {
    const user = await this.usersService.createUser(body);
    return {
      id: user.id,
      phone_number: user.phone_number,
      full_name: user.full_name,
      account_type: user.account_type,
      kyc_status: user.kyc_status,
      status: user.status,
      created_at: user.created_at,
    };
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete account (balance must be zero)' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 400, description: 'Balance must be zero' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteAccount(@CurrentUser() user: any) {
    return this.usersService.deleteAccount(user.userId);
  }

  @Get('me')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard, DbCircuitBreakerGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'Current user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Service temporarily unavailable' })
  async getMe(@CurrentUser() user: any) {
    if (user?.pendingRegistration) {
      return {
        id: null,
        phone_number: user.phone_number,
        full_name: null,
        email: null,
        nationality: null,
        city: null,
        date_of_birth: null,
        profile_photo_url: null,
        kyc_status: 'PENDING',
        status: 'ACTIVE',
        account_type: 'CONSUMER',
        profile_locked: false,
        locked_fields: [],
        linked_user_id: null,
        risk_score: null,
        last_login_at: null,
        created_at: null,
        updated_at: null,
        deletion_status: 'NONE',
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        pii_anonymized_at: null,
      };
    }
    return this.usersService.getMe(user.userId);
  }

  @Get('me/header')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard, DbCircuitBreakerGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Header badges, avatar, and host mode' })
  @ApiResponse({ status: 200, description: 'Aggregated header state' })
  async getHeader(@CurrentUser() user: any, @Req() req: Request) {
    if (user?.pendingRegistration) {
      return {
        notificationCount: 0,
        inboxCount: 0,
        avatar: null,
        hostMode: false,
      };
    }
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;
    return this.usersService.getHeaderState(user.userId, authHeader);
  }

  @Patch('profile')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update profile (consumer)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  @Post('me/change-phone')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Change phone number (OTP verification required)' })
  @ApiResponse({ status: 200, description: 'Phone updated' })
  @ApiResponse({ status: 400, description: 'Invalid OTP or phone already in use' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePhone(
    @CurrentUser() user: { userId: string },
    @Body() body: ChangePhoneDto,
  ) {
    return this.usersService.changePhone(
      user.userId,
      body.current_otp,
      body.new_phone_number,
      body.new_otp,
    );
  }

  @Get('me/consents/current')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current consent versions and states' })
  async getCurrentConsents(@CurrentUser() user: { userId: string }) {
    return this.usersService.getCurrentConsents(user.userId);
  }

  @Post('me/consents/accept-mandatory')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Accept Terms & Conditions and Privacy Policy (mandatory)',
  })
  async acceptMandatoryConsents(
    @CurrentUser() user: { userId: string },
    @Body() body: AcceptMandatoryConsentsDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.acceptMandatoryConsents({
      userId: user.userId,
      termsVersion: body.termsVersion,
      privacyVersion: body.privacyVersion,
      marketingOptIn: body.marketingOptIn,
      marketingVersion: body.marketingVersion,
      language: body.language ?? req.headers['accept-language']?.toString(),
      ipAddress: req.ip,
      deviceId: (req.headers['x-device-id'] as string) || null,
    });

    try {
      await this.auditService.audit({
        actorUserId: user.userId,
        action: 'CONSENT_MANDATORY_ACCEPTED',
        targetType: 'USER',
        targetId: user.userId,
        req,
        metadata: {
          termsVersion: body.termsVersion,
          privacyVersion: body.privacyVersion,
          marketingOptIn: body.marketingOptIn,
          language: body.language ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log failed after mandatory consent (userId=${user.userId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  @Patch('me/consents/marketing')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update marketing consent preference' })
  async updateMarketingConsent(
    @CurrentUser() user: { userId: string },
    @Body() body: UpdateMarketingConsentDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.updateMarketingConsent({
      userId: user.userId,
      granted: body.granted,
      version: body.version,
      language: body.language ?? req.headers['accept-language']?.toString(),
      ipAddress: req.ip,
      deviceId: (req.headers['x-device-id'] as string) || null,
    });

    try {
      await this.auditService.audit({
        actorUserId: user.userId,
        action: 'CONSENT_MARKETING_UPDATED',
        targetType: 'USER',
        targetId: user.userId,
        req,
        metadata: {
          granted: body.granted,
          version: body.version,
          language: body.language ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Audit log failed after marketing consent (userId=${user.userId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  @Get('me/data-rights/deletion-status')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get account deletion status' })
  async getDeletionStatus(@CurrentUser() user: { userId: string }) {
    return this.usersService.getDeletionStatus(user.userId);
  }

  @Post('me/data-rights/export')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Export my data (re-auth required)' })
  async exportMyData(
    @CurrentUser() user: { userId: string },
    @Body() body: DataExportDto,
    @Req() req: Request,
  ) {
    let result: { filename: string; mimeType: string; contentBase64: string };
    try {
      result = await this.usersService.exportUserData({
        userId: user.userId,
        pin: body.pin,
        format: body.format,
      });
    } catch (error) {
      await this.auditService.audit({
        actorUserId: user.userId,
        action: 'DATA_EXPORT_FAILED_REAUTH',
        targetType: 'USER',
        targetId: user.userId,
        req,
        metadata: { format: body.format },
      });
      throw error;
    }
    await this.auditService.audit({
      actorUserId: user.userId,
      action: 'DATA_EXPORT_REQUESTED',
      targetType: 'USER',
      targetId: user.userId,
      req,
      metadata: {
        format: body.format,
        filename: result.filename,
      },
    });
    return result;
  }

  @Post('me/data-rights/deletion-request')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Request account deletion (re-auth required)' })
  async requestAccountDeletion(
    @CurrentUser() user: { userId: string },
    @Body() body: DeletionRequestDto,
    @Req() req: Request,
  ) {
    let result: any;
    try {
      result = await this.usersService.requestAccountDeletion({
        userId: user.userId,
        pin: body.pin,
        reason: body.reason,
      });
    } catch (error) {
      await this.auditService.audit({
        actorUserId: user.userId,
        action: 'ACCOUNT_DELETION_REQUEST_FAILED_REAUTH',
        targetType: 'USER',
        targetId: user.userId,
        req,
        metadata: { reasonProvided: Boolean(body.reason) },
      });
      throw error;
    }
    await this.auditService.audit({
      actorUserId: user.userId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      targetType: 'USER',
      targetId: user.userId,
      req,
      metadata: {
        reasonProvided: Boolean(body.reason),
        scheduledFor: result.scheduledFor,
      },
    });
    return result;
  }

  @Post('me/profile-photo')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Upload profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Profile photo uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file (type/size)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadProfilePhoto(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.usersService.uploadProfilePhoto(user.userId, file);
  }

  @Get('me/profile-photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user profile photo' })
  @ApiResponse({ status: 200, description: 'Image file' })
  @ApiResponse({ status: 404, description: 'No profile photo' })
  async getProfilePhoto(
    @CurrentUser() user: { userId: string },
    @Res() res: Response,
  ) {
    const filePath = await this.usersService.getProfilePhotoPath(user.userId);
    if (!filePath) {
      throw new NotFoundException('No profile photo');
    }
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(filePath).pipe(res);
  }

  @Get('me/devices')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List trusted devices for current account' })
  async listTrustedDevices(
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const currentDeviceId = (req.headers['x-device-id'] as string) || null;
    return this.usersService.listTrustedDevices(user.userId, currentDeviceId);
  }

  @Delete('me/devices/:deviceId')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Remove a trusted device and revoke sessions for it',
  })
  async removeTrustedDevice(
    @CurrentUser() user: { userId: string },
    @Param('deviceId') deviceId: string,
    @Req() req: Request,
  ) {
    const currentDeviceId = (req.headers['x-device-id'] as string) || null;
    return this.usersService.removeTrustedDevice(
      user.userId,
      deviceId,
      currentDeviceId,
    );
  }

  @Post('me/push-token')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Register/update FCM push token for this device' })
  async registerPushToken(
    @CurrentUser() user: { userId: string },
    @Body() body: RegisterPushTokenDto,
    @Req() req: Request,
  ) {
    const deviceId = (req.headers['x-device-id'] as string) || '';
    await this.notificationsService.registerPushToken({
      userId: user.userId,
      deviceId,
      token: body.token,
      platform: body.platform,
      notificationsEnabled: body.enabled,
    });
    return { success: true };
  }

  @Delete('me/push-token')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Deactivate push token for this device' })
  async deactivatePushToken(
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
    @Body() body?: { token?: string },
  ) {
    const deviceId = (req.headers['x-device-id'] as string) || null;
    await this.notificationsService.deactivatePushToken({
      userId: user.userId,
      deviceId,
      token: body?.token || null,
    });
    return { success: true };
  }

  @Patch('me/push-preferences')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update push notification preferences' })
  async updatePushPreferences(
    @CurrentUser() user: { userId: string },
    @Body() body: UpdatePushPreferenceDto,
    @Req() req: Request,
  ) {
    const deviceId = (req.headers['x-device-id'] as string) || null;
    await this.notificationsService.updateNotificationPreference({
      userId: user.userId,
      enabled: body.transaction_alerts_enabled,
      deviceId,
    });
    return { success: true };
  }

  @Get('me/notifications')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List inbox notifications (newest first, max 20)' })
  async listNotifications(
    @CurrentUser() user: { userId: string },
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const items = await this.userNotificationsService.list(user.userId, limit);
    return { data: items };
  }

  @Get('me/notifications/unread-count')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Unread notification count' })
  async unreadNotificationCount(@CurrentUser() user: { userId: string }) {
    const count = await this.userNotificationsService.unreadCount(user.userId);
    return { data: { count } };
  }

  @Patch('me/notifications/read-all')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllNotificationsRead(@CurrentUser() user: { userId: string }) {
    const result = await this.userNotificationsService.markAllRead(user.userId);
    return { data: result };
  }

  @Patch('me/notifications/:id/read')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markNotificationRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    const item = await this.userNotificationsService.markRead(user.userId, id);
    return { data: item };
  }
}
