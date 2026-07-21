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
  ): Promise<{ fullName: string | null; verified: boolean }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      fullName: user.full_name?.trim() || null,
      verified: user.kyc_status === 'VERIFIED',
    };
  }
}
