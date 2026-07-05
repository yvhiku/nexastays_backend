import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminUsersQueryDto } from '../dto/admin-users.query.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import type { AdminRequest } from '../types/admin-request';

@ApiTags('Pay Admin')
@Controller(['admin/users', 'pay/admin/users'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminUsersService.getUsers(query);
  }

  @Post('invite')
  inviteAdmin(@Body() body: { email: string; role?: string }) {
    return this.adminUsersService.inviteAdmin(body.email, body.role ?? 'ADMIN');
  }

  /**
   * Check driver and courier accounts for linked consumer accounts
   * GET /admin/users/check-driver-courier-consumer
   * IMPORTANT: This must come BEFORE @Get(':id') to avoid route conflicts
   */
  @Get('check-driver-courier-consumer')
  checkDriverCourierConsumerAccounts() {
    return this.adminUsersService.checkDriverCourierConsumerAccounts();
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.adminUsersService.getUser(id);
  }

  @Get(':id/wallet')
  getUserWallet(@Param('id') id: string) {
    return this.adminUsersService.getUserWallet(id);
  }

  @Get(':id/kyc')
  getUserKyc(@Param('id') id: string) {
    return this.adminUsersService.getUserKyc(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminUsersService.updateStatus(id, body.status, req.user);
  }

  @Post(':userId/freeze')
  freezeUser(@Param('userId') userId: string, @Req() req: AdminRequest) {
    return this.adminUsersService.freezeUser(userId, req.user);
  }

  @Post(':userId/unfreeze')
  unfreezeUser(@Param('userId') userId: string, @Req() req: AdminRequest) {
    return this.adminUsersService.unfreezeUser(userId, req.user);
  }

  @Post(':userId/force-logout')
  forceLogoutUser(@Param('userId') userId: string, @Req() req: AdminRequest) {
    return this.adminUsersService.forceLogoutUser(userId, req.user);
  }

  @Post(':userId/devices/:deviceId/untrust')
  untrustDevice(
    @Param('userId') userId: string,
    @Param('deviceId') deviceId: string,
    @Req() req: AdminRequest,
  ) {
    return this.adminUsersService.untrustDevice(userId, deviceId, req.user);
  }

  @Post(':userId/step-up')
  triggerStepUp(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
    @Req() req: AdminRequest,
  ) {
    return this.adminUsersService.triggerStepUp(
      userId,
      body.reason || '',
      req.user,
    );
  }

  @Post(':userId/compliance-tags')
  addComplianceTag(
    @Param('userId') userId: string,
    @Body() body: { tag?: string },
    @Req() req: AdminRequest,
  ) {
    const tag = (body.tag || 'WATCHLIST').trim() || 'WATCHLIST';
    return this.adminUsersService.addComplianceTag(userId, tag, req.user);
  }
}
