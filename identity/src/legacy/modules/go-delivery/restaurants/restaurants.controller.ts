import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MerchantsService } from '../merchants/merchants.service';
import { MenusService } from '../menus/menus.service';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

/**
 * RestaurantsController - Customer-facing endpoints
 * Note: "Restaurants" is the customer-facing term for merchants
 */
@ApiTags('Go Deliveries')
@Controller('go/delivery/restaurants')
@UseGuards(JwtAuthGuard)
export class RestaurantsController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly menusService: MenusService,
  ) {}

  /**
   * Get all active restaurants (merchants)
   * GET /go/delivery/restaurants
   */
  @Get()
  async getRestaurants() {
    return this.merchantsService.getActiveMerchants();
  }

  /**
   * Get restaurant menu
   * GET /go/delivery/restaurants/:id/menu
   */
  @Get(':id/menu')
  async getRestaurantMenu(@Param('id') merchantId: string) {
    // Verify merchant exists
    await this.merchantsService.getMerchantById(merchantId);
    return this.menusService.getMerchantMenus(merchantId);
  }
}
