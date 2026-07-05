import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminStaysService } from '../services/admin-stays.service';
import { HostApplicationsService } from '../../stays/hosts/host-applications.service';

@ApiTags('Stays Admin')
@Controller('admin/stays')
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminStaysController {
  constructor(
    private readonly adminStaysService: AdminStaysService,
    private readonly hostApplicationsService: HostApplicationsService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminStaysService.getStats();
  }

  @Get('listings')
  getListings(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminStaysService.getListings({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string) {
    return this.adminStaysService.getListing(id);
  }

  @Get('listings/:id/media/:assetId')
  @SkipThrottle()
  async getListingMedia(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const fullPath = await this.adminStaysService.getListingMediaPath(id, assetId);
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

  @Post('host-applications/:id/approve')
  approveHostApplication(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.hostApplicationsService.approve(id, user.userId);
  }

  @Post('host-applications/:id/reject')
  rejectHostApplication(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: { userId: string },
  ) {
    return this.hostApplicationsService.reject(
      id,
      body?.reason ?? '',
      user.userId,
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
    return this.adminStaysService.approveHost(id, user.userId, { ip, userAgent });
  }

  @Post('hosts/:id/reject')
  rejectHost(
    @Param('id') id: string,
    @Body() body: { reason: string },
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
    return this.adminStaysService.freezeHost(id, user.userId, { ip, userAgent });
  }

  @Post('hosts/:id/unfreeze')
  unfreezeHost(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.unfreezeHost(id, user.userId, { ip, userAgent });
  }

  @Post('listings/:id/approve')
  approveListing(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    const ip = (req as Request & { ip?: string }).ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'];
    return this.adminStaysService.approveListing(id, user.userId, { ip, userAgent });
  }

  @Post('listings/:id/reject')
  rejectListing(
    @Param('id') id: string,
    @Body() body: { reason: string },
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
