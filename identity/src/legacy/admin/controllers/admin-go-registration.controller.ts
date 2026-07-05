import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DbCircuitBreakerGuard } from '../../../common/guards/db-circuit-breaker.guard';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { join } from 'path';
import type { AdminRequest } from '../types/admin-request';
import {
  RegistrationApplicationsService,
  REGISTRATION_UPLOAD_DIR,
} from '../../go-taxi/registration-applications/registration-applications.service';

@ApiTags('Pay Admin')
@Controller(['admin/go/registration-applications', 'pay/admin/go/registration-applications'])
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminGoRegistrationController {
  constructor(
    private readonly registrationService: RegistrationApplicationsService,
  ) {}

  @Get()
  @UseGuards(DbCircuitBreakerGuard)
  list(
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.registrationService.list({
      status,
      role,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id/file/:filename')
  @UseGuards(DbCircuitBreakerGuard)
  async serveFile(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const app = await this.registrationService.getById(id);
    const relativePath = `${id}/${filename}`;
    const allowedPaths = [
      app.identity_front_path,
      app.identity_back_path,
      app.selfie_path,
      app.drivers_license_path,
      app.vehicle_registration_path,
      app.insurance_path,
      app.background_check_path,
      ...Object.values(app.vehicle_photos || {}),
    ].filter(Boolean) as string[];
    if (!allowedPaths.some((p) => p === relativePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    const fullPath = join(REGISTRATION_UPLOAD_DIR, relativePath);
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : '';
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    createReadStream(fullPath).pipe(res);
  }

  @Get(':id')
  @UseGuards(DbCircuitBreakerGuard)
  getById(@Param('id') id: string) {
    return this.registrationService.getById(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: AdminRequest) {
    const adminId = req.user?.userId || 'admin';
    return this.registrationService.approve(id, adminId);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AdminRequest,
  ) {
    const adminId = req.user?.userId || 'admin';
    return this.registrationService.reject(id, adminId, body.reason || 'Rejected by admin');
  }
}
