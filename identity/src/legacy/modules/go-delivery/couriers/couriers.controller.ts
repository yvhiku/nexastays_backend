import {
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CouriersService } from './couriers.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Go Deliveries')
@Controller('go/delivery/couriers')
@UseGuards(JwtAuthGuard)
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  /**
   * Onboard as a courier
   * POST /go/delivery/couriers/onboard
   */
  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  async onboardCourier(@CurrentUser() user: any) {
    return this.couriersService.onboardCourier(user.userId);
  }

  /**
   * Go online (set availability)
   * POST /go/delivery/couriers/online
   * Note: For MVP, this is a placeholder. In production, track courier availability.
   */
  @Post('online')
  async goOnline(@CurrentUser() user: any) {
    // For MVP, just return success
    // In production, update courier availability status
    return {
      message: 'Courier is now online',
      userId: user.userId,
    };
  }
}
