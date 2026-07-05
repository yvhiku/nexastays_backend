import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdentitySnapshotService } from './identity-snapshot.service';

@ApiTags('Identity Snapshots')
@Controller('snapshots')
export class IdentitySnapshotController {
  constructor(private readonly snapshotService: IdentitySnapshotService) {}

  /** Compliance snapshot for the authenticated account — not embedded in JWT. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get cached KYC/compliance snapshot for current user' })
  async getMySnapshot(@CurrentUser() user: { userId: string }) {
    return this.snapshotService.getSnapshot(user.userId);
  }
}
