import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Request, Response } from 'express';
import { StaysService } from './stays.service';
import { HostsService } from './hosts/hosts.service';
import { HostListingsService } from './services/host-listings.service';
import { HostApplicationsService } from './hosts/host-applications.service';
import { HostOnboardingService } from './hosts/host-onboarding.service';
import { SubmitHostOnboardingDto } from './dto/submit-host-onboarding.dto';
import type { StaysUserContext } from './hosts/host-onboarding.types';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { StaysCancellationService } from './services/stays-cancellation.service';
import { StaysReviewsService } from './services/stays-reviews.service';
import { HostDashboardService } from './services/host-dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SearchListingsDto } from './dto/search-listings.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateHostListingDto } from './dto/create-host-listing.dto';
import { UpdateHostListingDto } from './dto/update-host-listing.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { IdentitySnapshotClient } from '../../common/identity/identity-snapshot.client';
import type { IdentityJwtUser } from '../identity-auth/identity-jwt.strategy';

@ApiTags('Stays')
@Controller('stays')
export class StaysController {
  private readonly logger = new Logger(StaysController.name);

  constructor(
    private readonly staysService: StaysService,
    private readonly hostsService: HostsService,
    private readonly hostListingsService: HostListingsService,
    private readonly hostApplicationsService: HostApplicationsService,
    private readonly hostOnboardingService: HostOnboardingService,
    private readonly cancellationService: StaysCancellationService,
    private readonly staysReviewsService: StaysReviewsService,
    private readonly hostDashboardService: HostDashboardService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly identitySnapshotClient: IdentitySnapshotClient,
  ) {}

  private authHeader(req: Request): string {
    return (req.headers.authorization as string) ?? '';
  }

  private async userWithSnapshot(
    user: IdentityJwtUser,
    req: Request,
  ): Promise<StaysUserContext> {
    const snapshot = await this.identitySnapshotClient.fetchSnapshot(
      this.authHeader(req),
      user.userId,
    );
    return {
      userId: user.userId,
      unified_identity_id: user.unified_identity_id,
      account_type: user.account_type,
      identitySnapshot: snapshot,
    };
  }

  /** Public fee configuration for web/mobile checkout displays */
  @Get('config/fees')
  @Public()
  @ApiOperation({ summary: 'Platform guest/host service fee rates' })
  getFeeConfig() {
    return this.platformSettings.getFeeRates();
  }

  /**
   * Search listings - public, no auth required for browsing
   */
  @Get('listings/search')
  @Public()
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 30 : 100,
      ttl: 60000,
    },
  })
  @ApiOperation({ summary: 'Search available listings' })
  async searchListings(@Query() query: SearchListingsDto) {
    return this.staysService.searchListings({
      city: query.city,
      checkin_date: query.checkin_date,
      checkout_date: query.checkout_date,
      guests: query.guests,
      verified_walkthrough_only: query.verified_walkthrough_only,
      instant_booking_only: query.instant_booking_only,
    });
  }

  /**
   * Serve listing media (photos, walkthrough) - public for LIVE listings only
   */
  @Get('listings/:id/media/:assetId')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get listing media file' })
  async getListingMedia(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const fullPath = await this.staysService.getListingMediaPath(id, assetId);
    const ext = fullPath.includes('.') ? fullPath.split('.').pop()?.toLowerCase() : '';
    const contentType =
      ext === 'mp4'
        ? 'video/mp4'
        : ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(fullPath).pipe(res);
  }

  /**
   * Get listing by ID - address/contact masked unless user has confirmed booking
   */
  @Get('listings/:id')
  @Public()
  @ApiOperation({ summary: 'Get listing details' })
  async getListing(
    @Param('id') id: string,
    @CurrentUser() user?: { userId?: string },
  ) {
    return this.staysService.getListingById(id, user?.userId ?? undefined);
  }

  /**
   * Public reviews for a listing (newest first, paginated)
   */
  @Get('listings/:listingId/reviews')
  @Public()
  @ApiOperation({ summary: 'List reviews for a listing' })
  async listListingReviews(
    @Param('listingId') listingId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? Number.parseInt(page, 10) : 1;
    const l = limit ? Number.parseInt(limit, 10) : 10;
    return this.staysReviewsService.listListingReviews(
      listingId,
      Number.isFinite(p) ? p : 1,
      Number.isFinite(l) ? l : 10,
    );
  }

  /**
   * Upload occupant ID document before booking (returns asset_id for create booking)
   */
  @Post('bookings/occupants/upload-id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload occupant ID document (front or back)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        side: { type: 'string', enum: ['front', 'back'] },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadOccupantIdDocument(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('side') side: string | undefined,
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    const normalizedSide: 'front' | 'back' = side === 'back' ? 'back' : 'front';
    return this.staysService.uploadOccupantIdDocument(
      user.userId,
      file,
      normalizedSide,
      { ip, userAgent },
    );
  }

  /**
   * Create booking - requires verified identity (from Pay/Go unified account)
   */
  @Post('bookings')
  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 5 : 20,
      ttl: 60000,
    },
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a booking' })
  async createBooking(
    @CurrentUser() user: IdentityJwtUser,
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    const snapshot = await this.identitySnapshotClient.fetchSnapshot(
      this.authHeader(req),
      user.userId,
    );
    try {
      return await this.staysService.createBooking(user.userId, dto, {
        ip,
        userAgent,
        identitySnapshot: snapshot,
      });
    } catch (err: unknown) {
      this.logger.error('createBooking failed', err instanceof Error ? err.stack : String(err));
      throw err;
    }
  }

  /**
   * Cancel booking - guest or host
   */
  @Post('bookings/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booking' })
  async cancelBooking(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: CancelBookingDto,
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.cancellationService.cancel(
      id,
      user.userId,
      dto.cancelled_by,
      dto.reason,
      { ip, userAgent },
    );
  }

  /**
   * Get booking - reveals address/contact only when CONFIRMED and both verified
   */
  @Get('bookings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking details' })
  async getBooking(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.staysService.getBookingById(id, user.userId);
  }

  /**
   * Guest submits a written review after checkout (once per booking)
   */
  @Post('bookings/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a listing review for a booking' })
  async submitBookingReview(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.staysReviewsService.createReview(user.userId, id, body);
  }

  /**
   * Host's listings (approved hosts only; returns all statuses)
   */
  @Get('host/listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host listings' })
  async getHostListings(@CurrentUser() user: { userId: string }) {
    return this.hostListingsService.getHostListings(user.userId);
  }

  @Get('host/listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host listing detail for editing' })
  async getHostListingById(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.hostListingsService.getHostListingById(user.userId, id);
  }

  @Patch('host/listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update host listing' })
  async updateHostListing(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UpdateHostListingDto,
  ) {
    return this.hostListingsService.updateListing(user.userId, id, body);
  }

  @Post('host/listings/:id/pause')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause listing (hide from search)' })
  async pauseHostListing(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.hostListingsService.pauseListing(user.userId, id);
  }

  @Post('host/listings/:id/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume paused listing' })
  async resumeHostListing(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.hostListingsService.resumeListing(user.userId, id);
  }

  /**
   * Guest's booking history - all bookings made by the current user
   */
  @Get('bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get guest booking history' })
  async getGuestBookings(@CurrentUser() user: { userId: string }) {
    return this.staysService.getGuestBookings(user.userId);
  }

  /**
   * Host dashboard KPIs — earnings, bookings, listings, reviews
   */
  @Get('host/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host dashboard KPI stats' })
  async getHostStats(@CurrentUser() user: { userId: string }) {
    return this.hostDashboardService.getHostStats(user.userId);
  }

  /**
   * Host's bookings - all bookings on listings owned by the host
   */
  @Get('host/bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host bookings' })
  async getHostBookings(@CurrentUser() user: { userId: string }) {
    return this.staysService.getHostBookings(user.userId);
  }

  /**
   * Reviews across host's listings (dashboard)
   */
  @Get('host/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List guest reviews for all host listings' })
  async getHostReviews(
    @CurrentUser() user: { userId: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? Number.parseInt(page, 10) : 1;
    const l = limit ? Number.parseInt(limit, 10) : 20;
    return this.staysReviewsService.listHostReviews(
      user.userId,
      Number.isFinite(p) ? p : 1,
      Number.isFinite(l) ? l : 20,
    );
  }

  /**
   * Create listing - requires approved host
   */
  @Post('host/listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create listing' })
  async createHostListing(
    @CurrentUser() user: { userId: string },
    @Body() body: CreateHostListingDto,
  ) {
    return this.hostListingsService.createListing(user.userId, body);
  }

  /**
   * Upload listing photo - returns asset_id for create listing
   */
  @Post('host/listings/media/photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload listing photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadListingPhoto(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.hostListingsService.uploadListingPhoto(user.userId, file);
  }

  /**
   * Upload listing walkthrough video
   */
  @Post('host/listings/media/walkthrough')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload listing walkthrough video' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadListingWalkthrough(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.hostListingsService.uploadListingWalkthrough(user.userId, file);
  }

  /**
   * Unified host onboarding (mobile + web).
   */
  @Post('host/onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit unified host onboarding' })
  async submitHostOnboarding(
    @CurrentUser() user: IdentityJwtUser,
    @Body() body: SubmitHostOnboardingDto,
    @Req() req: Request,
  ) {
    const ctx = await this.userWithSnapshot(user, req);
    const source = (body.source ?? 'WEB') as 'WEB' | 'MOBILE' | 'ADMIN' | 'UNKNOWN';
    const submittedFrom = body.submitted_from ?? 'API_HOST_ONBOARDING';
    return this.hostOnboardingService.submitHostOnboarding(ctx, body, {
      source,
      submitted_from: submittedFrom,
      requirePolicies: body.hosting_policies_accepted === true,
    });
  }

  /**
   * Host onboarding status for current user.
   */
  @Get('host/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host onboarding status for current user' })
  async getHostMe(@CurrentUser() user: IdentityJwtUser, @Req() req: Request) {
    return this.hostOnboardingService.getHostMe(await this.userWithSnapshot(user, req));
  }

  /**
   * Submit host application (CONSUMER only) — compat; writes stays_host_profiles.
   */
  @Post('host/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply to become a host' })
  async submitHostApplication(
    @CurrentUser() user: IdentityJwtUser,
    @Body()
    body: {
      full_name?: string;
      email?: string;
      identity_reused?: boolean;
      hosting_policies_accepted?: boolean;
    },
    @Req() req: Request,
  ) {
    return this.hostApplicationsService.submit(
      await this.userWithSnapshot(user, req),
      body,
    );
  }

  /**
   * Get host application status for current applicant.
   */
  @Get('host/application/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host application status' })
  async getHostApplicationStatus(@CurrentUser() user: { userId: string }) {
    return this.hostApplicationsService.getStatusByUserId(user.userId);
  }

  /**
   * Host verification status - only hosts need this
   */
  @Get('host/verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get host verification status' })
  async getHostVerification(
    @CurrentUser() user: IdentityJwtUser,
    @Req() req: Request,
  ) {
    const ctx = await this.userWithSnapshot(user, req);
    return this.hostsService.getHostVerificationStatus(ctx);
  }

  /**
   * Submit host verification - required to publish listings
   */
  @Post('host/verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 3 : 50,
      ttl: 86400000,
    },
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit host identity verification' })
  async submitHostVerification(
    @CurrentUser() user: IdentityJwtUser,
    @Req() req: Request,
    @Body()
    body: {
      full_name?: string;
      email?: string;
      phone?: string;
      city?: string;
      host_type?: string;
      hosting_policies_accepted?: boolean;
      document_type?: string;
      document_number_hash?: string;
      document_front_asset_id?: string;
      document_back_asset_id?: string;
      selfie_asset_id?: string;
      use_existing_kyc?: boolean;
      submitted_from?: string;
    },
  ) {
    const ctx = await this.userWithSnapshot(user, req);
    return this.hostsService.submitHostVerification(ctx, body);
  }

  /**
   * Upload host ID document front
   */
  @Post('host/verification/documents/front')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload host ID document (front)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadHostDocumentFront(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.hostsService.uploadDocumentFront(user.userId, file);
  }

  /**
   * Upload host ID document back
   */
  @Post('host/verification/documents/back')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload host ID document (back)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadHostDocumentBack(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.hostsService.uploadDocumentBack(user.userId, file);
  }

  /**
   * Upload host selfie (profile photo)
   */
  @Post('host/verification/documents/selfie')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload host selfie' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadHostSelfie(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.hostsService.uploadSelfie(user.userId, file);
  }
}
