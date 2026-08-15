import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { UsersService } from './users.service';

@ApiTags('internal-users')
@Controller('internal/users')
@Public()
@UseGuards(InternalServiceGuard)
export class InternalUsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Must be declared before `:userId` routes so "support-agents" is not captured as an id. */
  @Get('support-agents')
  @ApiOperation({
    summary: 'S2S: ACTIVE SUPPORT_AGENT roster for ticket auto-assignment',
  })
  async listActiveSupportAgents(): Promise<{
    items: { id: string; status: string; staff_role: string }[];
  }> {
    return this.usersService.listActiveSupportAgents();
  }

  @Get(':userId/authz')
  @ApiOperation({ summary: 'S2S: authz version for ADMIN role revocation checks' })
  async authzState(
    @Param('userId') userId: string,
  ): Promise<{
    authz_version: number;
    status: string;
    account_type: string;
    staff_role: string;
  }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      authz_version: Number(user.authz_version ?? 1),
      status: user.status,
      account_type: user.account_type,
      staff_role: user.staff_role || 'ADMIN',
    };
  }

  @Get(':userId/profile-photo/exists')
  @ApiOperation({ summary: 'S2S: whether user has an uploaded profile photo' })
  async profilePhotoExists(@Param('userId') userId: string): Promise<{ hasPhoto: boolean }> {
    const filePath = await this.usersService.getProfilePhotoPath(userId);
    return { hasPhoto: !!filePath };
  }

  @Get(':userId/profile-photo')
  @ApiOperation({ summary: 'S2S: stream user profile photo bytes' })
  async getProfilePhoto(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.usersService.getProfilePhotoPath(userId);
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

  @Get(':userId/profile-summary')
  @ApiOperation({ summary: 'S2S: minimal profile for messaging presentation' })
  async profileSummary(
    @Param('userId') userId: string,
  ): Promise<{
    fullName: string | null;
    email: string | null;
    phone: string | null;
    verified: boolean;
    preferredLanguage: string | null;
  }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      fullName: user.full_name?.trim() || null,
      email: user.email?.trim() || null,
      phone: user.phone_number?.trim() || null,
      verified: user.kyc_status === 'VERIFIED',
      preferredLanguage: await this.usersService.getPreferredLanguageForUser(
        user.unified_identity_id,
      ),
    };
  }
}
