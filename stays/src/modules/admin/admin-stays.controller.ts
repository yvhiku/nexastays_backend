import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminStaysService } from './admin-stays.service';
import { StaysReviewsService } from '../stays/services/stays-reviews.service';
import { HostApplicationsService } from '../stays/hosts/host-applications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { UpdateFeeSettingsDto } from '../platform-settings/dto/update-fee-settings.dto';
import { RejectReasonDto } from '../stays/dto/input-security.dto';

@ApiTags('Stays Admin')
@Controller('admin/stays')
@Throttle({
  short: { limit: 30, ttl: 1000 },
  default: { limit: 300, ttl: 60000 },
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminStaysController {
  constructor(
    private readonly adminStaysService: AdminStaysService,
    private readonly hostApplicationsService: HostApplicationsService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly staysReviewsService: StaysReviewsService,
  ) {}

  @Get('settings/fees')
  getFeeSettings() {
    return this.platformSettings.getFeeRates();
  }

  @Patch('settings/fees')
  updateFeeSettings(
    @Body() body: UpdateFeeSettingsDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.platformSettings.updateFeeRates(
      body.guest_fee_pct,
      body.host_fee_pct,
      user.userId,
    );
  }

  @Get('stats')
  getStats() {
    return this.adminStaysService.getStats();
  }

  @Get('ops-overview')
  getOpsOverview() {
    return this.adminStaysService.getOpsOverview();
  }

  @Get('listing-counts')
  getListingCounts() {
    return this.adminStaysService.getListingCounts();
  }

  @Get('listings')
  getListings(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
  ) {
    return this.adminStaysService.getListings({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sort: sort === 'newest' || sort === 'oldest' || sort === 'priority' ? sort : undefined,
    });
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string) {
    return this.adminStaysService.getListing(id);
  }

  @Get('listings/:id/media/:assetId')
  async getListingMedia(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const fullPath = await this.adminStaysService.getListingMediaPath(
      id,
      assetId,
    );
    const ext = fullPath.includes('.')
      ? fullPath.split('.').pop()?.toLowerCase()
      : '';
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
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(fullPath).pipe(res);
  }

  @Get('host-applications')
  getHostApplications(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.hostApplicationsService.list({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('host-applications/:id/documents/:kind')
  async getHostApplicationDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Res() res: Response,
  ) {
    const normalized: 'front' | 'back' | 'selfie' =
      kind === 'back' ? 'back' : kind === 'selfie' ? 'selfie' : 'front';
    const fullPath =
      await this.hostApplicationsService.getVerificationDocumentPath(
        id,
        normalized,
      );
    const ext = fullPath.includes('.')
      ? fullPath.split('.').pop()?.toLowerCase()
      : '';
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(fullPath).pipe(res);
  }

  @Post('host-applications/:id/approve')
  approveHostApplication(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.hostApplicationsService.approve(id, user.userId);
  }

  @Post('host-applications/:id/reject')
  rejectHostApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectReasonDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.hostApplicationsService.reject(
      id,
      user.userId,
      body?.reason ?? '',
    );
  }

  @Get('hosts')
  getHosts(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminStaysService.getHosts({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('bookings')
  getBookings(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminStaysService.getBookings({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('bookings/:id')
  getBooking(@Param('id') id: string) {
    return this.adminStaysService.getBooking(id);
  }

  @Get('bookings/:bookingId/occupants/:occupantId/id-document/:side')
  async getOccupantIdDocument(
    @Param('bookingId') bookingId: string,
    @Param('occupantId') occupantId: string,
    @Param('side') side: string,
    @Res() res: Response,
  ) {
    const normalizedSide: 'front' | 'back' = side === 'back' ? 'back' : 'front';
    const fullPath = await this.adminStaysService.getOccupantIdDocumentPath(
      bookingId,
      occupantId,
      normalizedSide,
    );
    const ext = fullPath.includes('.')
      ? fullPath.split('.').pop()?.toLowerCase()
      : '';
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(fullPath).pipe(res);
  }

  @Get('reviews')
  getReviews(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const normalized =
      status === 'PUBLISHED' || status === 'HIDDEN' || status === 'REMOVED'
        ? status
        : undefined;
    return this.staysReviewsService.adminListReviews({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      status: normalized,
    });
  }

  @Patch('reviews/:id/hide')
  hideReview(@Param('id') id: string) {
    return this.staysReviewsService.adminSetReviewStatus(id, 'HIDDEN');
  }

  @Patch('reviews/:id/publish')
  publishReview(@Param('id') id: string) {
    return this.staysReviewsService.adminSetReviewStatus(id, 'PUBLISHED');
  }

  @Delete('reviews/:id')
  deleteReview(@Param('id') id: string) {
    return this.staysReviewsService.adminSetReviewStatus(id, 'REMOVED');
  }

  @Get('audit-logs')
  getAuditLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminStaysService.getAuditLogs({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('health')
  health() {
    return this.adminStaysService.checkHealth();
  }

  @Post('hosts/:id/approve')
  approveHost(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.approveHost(id, user.userId, {
      ip,
      userAgent,
    });
  }

  @Post('hosts/:id/reject')
  rejectHost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectReasonDto,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.rejectHost(
      id,
      body?.reason ?? '',
      user.userId,
      { ip, userAgent },
    );
  }

  @Post('hosts/:id/freeze')
  freezeHost(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.freezeHost(id, user.userId, {
      ip,
      userAgent,
    });
  }

  @Post('hosts/:id/unfreeze')
  unfreezeHost(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.unfreezeHost(id, user.userId, {
      ip,
      userAgent,
    });
  }

  @Post('listings/:id/approve')
  approveListing(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.approveListing(id, user.userId, {
      ip,
      userAgent,
    });
  }

  @Post('listings/:id/reject')
  rejectListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectReasonDto,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.rejectListing(
      id,
      body?.reason ?? '',
      user.userId,
      { ip, userAgent },
    );
  }

  @Post('listings/:id/set-live')
  setListingLive(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.setListingLive(id, user.userId, {
      ip,
      userAgent,
    });
  }
}
