import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OnboardDriverDto } from './dto/onboard-driver.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

@ApiTags('Go Drivers')
@Controller('go/drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /**
   * Get current driver's profile (for app profile screen).
   * GET /go/drivers/me
   * Returns driver profile + vehicle summary + document statuses from registration.
   */
  @Get('me')
  async getMyProfile(@CurrentUser() user: any) {
    // Trace: prove this controller handles GET /go/drivers/me
    console.log('[DriversController] GET /go/drivers/me hit, authUserId=', user?.userId);
    const profile = await this.driversService.getDriverProfileForUser(user.userId);
    if (!profile) {
      console.log('[DriversController] GET /me returning null (not a driver)');
      return { data: null, message: 'Not a driver' };
    }
    console.log('[DriversController] GET /me returning profile, vehicle_summary=', profile?.vehicle_summary);
    return { data: profile };
  }

  /**
   * Get all drivers (admin only)
   * GET /go/drivers
   */
  @Get()
  @UseGuards(AccountTypeGuard)
  @AccountTypes('ADMIN')
  async getDrivers(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.driversService.listForAdmin({
      status,
      page: page != null ? parseInt(String(page), 10) : undefined,
      limit: limit != null ? parseInt(String(limit), 10) : undefined,
    });
  }

  /**
   * Get driver by ID (admin only)
   * GET /go/drivers/:id
   */
  @Get(':id')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('ADMIN')
  async getDriver(@Param('id') id: string) {
    return {
      data: null,
      message: 'Driver endpoint not fully implemented yet',
    };
  }

  /**
   * Onboard as a driver
   * POST /go/drivers/onboard
   */
  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  async onboardDriver(@CurrentUser() user: any, @Body() dto: OnboardDriverDto) {
    return this.driversService.onboardDriver(
      user.userId,
      dto.vehicle_type,
      dto.vehicle_plate,
    );
  }

  /**
   * Go online (set availability)
   * POST /go/drivers/online
   */
  @Post('online')
  async goOnline(@CurrentUser() user: any, @Body() dto: UpdateAvailabilityDto) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.driversService.setAvailability(
      driver.id,
      true,
      dto.latitude,
      dto.longitude,
    );
  }

  /**
   * Go offline
   * POST /go/drivers/offline
   */
  @Post('offline')
  async goOffline(@CurrentUser() user: any) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.driversService.setAvailability(driver.id, false);
  }
}
