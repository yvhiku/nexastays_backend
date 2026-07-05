import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RidesService } from './rides.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';

@ApiTags('Go Rides')
@Controller('go')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post('rides')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER')
  create(@CurrentUser() user: any, @Body() body: CreateRideDto) {
    return this.ridesService.create(user.userId, body);
  }

  @Patch('rides/:id/accept')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('DRIVER')
  accept(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ridesService.accept(id, user.userId);
  }

  @Patch('rides/:id/arrive')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('DRIVER')
  arrive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ridesService.arrive(id, user.userId);
  }

  @Patch('rides/:id/start')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('DRIVER')
  start(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ridesService.start(id, user.userId);
  }

  @Patch('rides/:id/complete')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('DRIVER')
  complete(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body?: CompleteRideDto,
  ) {
    return this.ridesService.complete(
      id,
      user.userId,
      body?.final_distance_km,
      body?.final_duration_min,
    );
  }

  @Post('rides/:id/cancel')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER', 'DRIVER')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body?: CancelRideDto,
  ) {
    return this.ridesService.cancel(id, user.userId, user.account_type, body?.reason);
  }

  @Get('rides')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER', 'DRIVER', 'ADMIN')
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.ridesService.list(
      user.account_type ?? 'CONSUMER',
      user.userId,
      status,
    );
  }

  /** Unassigned REQUESTED rides for drivers to accept (optional: within radius_km of driver). Must be before rides/:id. */
  @Get('rides/available')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('DRIVER', 'ADMIN')
  listAvailable(
    @CurrentUser() user: any,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius_km') radiusKm?: string,
  ) {
    const driverLat = lat != null ? parseFloat(lat) : undefined;
    const driverLng = lng != null ? parseFloat(lng) : undefined;
    const radius =
      radiusKm != null ? parseFloat(radiusKm) : 1;
    return this.ridesService.listAvailableForDriver(
      driverLat,
      driverLng,
      Number.isFinite(radius) && radius > 0 ? radius : 1,
    );
  }

  @Get('rides/:id')
  @UseGuards(JwtAuthGuard, AccountTypeGuard)
  @AccountTypes('CONSUMER', 'DRIVER', 'ADMIN')
  getOne(@Param('id') id: string) {
    return this.ridesService.getOne(id);
  }
}
