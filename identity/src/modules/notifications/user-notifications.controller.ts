import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OtpSessionResolverGuard } from '../../common/guards/otp-session-resolver.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserNotificationsService } from './user-notifications.service';

@ApiTags('Pay Users')
@Controller(['users', 'pay/users'])
export class UserNotificationsController {
  constructor(private readonly notifications: UserNotificationsService) {}

  @Get('me/notifications')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List inbox notifications (newest first, max 20)' })
  async list(
    @CurrentUser() user: { userId: string },
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const items = await this.notifications.list(user.userId, limit);
    return { data: items };
  }

  @Get('me/notifications/unread-count')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Unread notification count' })
  async unreadCount(@CurrentUser() user: { userId: string }) {
    const count = await this.notifications.unreadCount(user.userId);
    return { data: { count } };
  }

  @Patch('me/notifications/read-all')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: { userId: string }) {
    const result = await this.notifications.markAllRead(user.userId);
    return { data: result };
  }

  @Patch('me/notifications/:id/read')
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    const item = await this.notifications.markRead(user.userId, id);
    return { data: item };
  }
}
