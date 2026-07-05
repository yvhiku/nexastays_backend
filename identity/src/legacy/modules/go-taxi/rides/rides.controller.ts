import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { RidesService } from './rides.service';
import { DriversService } from '../drivers/drivers.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestRideDto } from './dto/request-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { RideStatus } from '../enums/ride-status.enum';

@Controller('go/rides')
@UseGuards(JwtAuthGuard)
export class RidesController {
  constructor(
    private readonly ridesService: RidesService,
    private readonly driversService: DriversService,
  ) {}

  /**
   * Request a new ride (Rider)
   * POST /go/rides/request
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestRide(@CurrentUser() user: any, @Body() dto: RequestRideDto) {
    return this.ridesService.requestRide(
      user.userId,
      dto.pickup_lat,
      dto.pickup_lng,
      dto.dropoff_lat,
      dto.dropoff_lng,
    );
  }

  /**
   * Get ride details (Rider or Driver)
   * GET /go/rides/:id
   */
  @Get(':id')
  async getRide(@CurrentUser() user: any, @Param('id') rideId: string) {
    return this.ridesService.getRideById(rideId, user.userId);
  }

  /**
   * Cancel ride (Rider or Driver)
   * POST /go/rides/:id/cancel
   */
  @Post(':id/cancel')
  async cancelRide(
    @CurrentUser() user: any,
    @Param('id') rideId: string,
    @Body() dto: CancelRideDto,
  ) {
    return this.ridesService.cancelRide(rideId, user.userId, dto.reason);
  }

  /**
   * Accept ride (Driver)
   * POST /go/rides/:id/accept
   */
  @Post(':id/accept')
  async acceptRide(@CurrentUser() user: any, @Param('id') rideId: string) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.ridesService.acceptRide(rideId, driver.id);
  }

  /**
   * Mark arrived at pickup (Driver)
   * POST /go/rides/:id/arrive
   */
  @Post(':id/arrive')
  async arriveRide(@CurrentUser() user: any, @Param('id') rideId: string) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.ridesService.updateRideStatus(
      rideId,
      RideStatus.ARRIVED,
      driver.id,
    );
  }

  /**
   * Start ride (Driver)
   * POST /go/rides/:id/start
   */
  @Post(':id/start')
  async startRide(@CurrentUser() user: any, @Param('id') rideId: string) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.ridesService.updateRideStatus(
      rideId,
      RideStatus.STARTED,
      driver.id,
    );
  }

  /**
   * Complete ride and trigger payment (Driver)
   * POST /go/rides/:id/complete
   */
  @Post(':id/complete')
  async completeRide(
    @CurrentUser() user: any,
    @Param('id') rideId: string,
    @Body() dto: CompleteRideDto,
  ) {
    const driver = await this.driversService.getDriverByUserId(user.userId);
    if (!driver) {
      throw new BadRequestException('User is not a driver');
    }
    return this.ridesService.completeRide(
      rideId,
      driver.id,
      dto.final_distance,
      dto.final_time,
    );
  }
}
