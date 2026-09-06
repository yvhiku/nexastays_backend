import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { access, readFile } from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DbCircuitBreakerGuard } from '../../../common/guards/db-circuit-breaker.guard';
import { AdminKycService } from '../services/admin-kyc.service';
import { AdminKycQueryDto } from '../dto/admin-kyc.query.dto';
import { ComplianceService } from '../../compliance/compliance.service';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import {
  detectImageType,
  mimetypeFromDetected,
} from '../../compliance/image-type.util';

@ApiTags('Pay Admin')
@Controller(['admin/kyc', 'pay/admin/kyc'])
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminKycController {
  constructor(
    private readonly adminKycService: AdminKycService,
    private readonly complianceService: ComplianceService,
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
  ) {}

  @Get('applications')
  @SkipThrottle({ default: true })
  @UseGuards(DbCircuitBreakerGuard)
  getApplications(@Query() query: AdminKycQueryDto) {
    return this.adminKycService.getQueue(query);
  }

  /** DEV only: debug KYC profile for a user. Returns 404 in production. */
  @Get('debug/user/:userId')
  getDebugUser(@Param('userId') userId: string) {
    return this.adminKycService.getDebugUser(userId);
  }

  /**
   * Declared before `@Get(':id')` so the static suffix is unambiguous.
   * Re-pulls Sumsub applicant data and backfills empty KYC identity fields.
   */
  @Post(':id/resync')
  @ApiOperation({
    summary:
      'Re-pull the Sumsub applicant and backfill empty identity fields on this KYC case',
  })
  resyncFromSumsub(
    @Param('id') id: string,
    @CurrentUser() adminUser: { userId?: string; email?: string },
    @Req() req: Request,
  ) {
    return this.adminKycService.resyncFromSumsub(id, adminUser, req);
  }

  @Get(':id/media/:slot')
  @ApiOperation({ summary: 'Stream a stored KYC document/selfie for admin review' })
  async getMedia(
    @Param('id') id: string,
    @Param('slot') slot: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const kyc = await this.kycRepository.findOne({ where: { id } });
    if (!kyc) throw new NotFoundException('KYC case not found');
    const rel =
      slot === 'front'
        ? (kyc.document_front_url ?? kyc.id_document_url)
        : slot === 'back'
          ? kyc.document_back_url
          : slot === 'selfie'
            ? kyc.selfie_url
            : null;
    if (!rel) throw new NotFoundException('Media not found');
    const filename = path.basename(rel);
    const fullPath = await this.complianceService.getKycFilePath(
      kyc.user_id,
      filename,
    );
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException('Media file missing on disk');
    }
    const buf = await readFile(fullPath);
    const detected = detectImageType(buf);
    const mime = detected
      ? mimetypeFromDetected(detected)
      : 'application/octet-stream';
    res.set({
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=60',
    });
    return new StreamableFile(createReadStream(fullPath));
  }

  @Get(':id')
  getCase(@Param('id') id: string) {
    return this.adminKycService.getCase(id);
  }
}
