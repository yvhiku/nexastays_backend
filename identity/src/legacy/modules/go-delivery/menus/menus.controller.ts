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
import { MenusService } from './menus.service';
import { MerchantsService } from '../merchants/merchants.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';
import { CreateMenuDto } from './dto/create-menu.dto';
import { AddMenuItemDto } from './dto/add-menu-item.dto';

@ApiTags('Go Deliveries')
@Controller('go/delivery/menus')
@UseGuards(JwtAuthGuard)
export class MenusController {
  constructor(
    private readonly menusService: MenusService,
    private readonly merchantsService: MerchantsService,
  ) {}

  /**
   * Get merchant menu with items (Consumer)
   * GET /go/delivery/menus/merchant/:merchantId
   */
  @Get('merchant/:merchantId')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('CONSUMER', 'ADMIN')
  async getMerchantMenu(@Param('merchantId') merchantId: string) {
    return this.menusService.getMerchantMenu(merchantId);
  }

  /**
   * Create a menu (Merchant)
   * POST /go/delivery/menus
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMenu(@CurrentUser() user: any, @Body() dto: CreateMenuDto) {
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    if (!merchant) {
      throw new BadRequestException('User is not a merchant');
    }
    return this.menusService.createMenu(merchant.id, dto.name);
  }

  /**
   * Add item to menu (Merchant)
   * POST /go/delivery/menus/items
   */
  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async addMenuItem(@CurrentUser() user: any, @Body() dto: AddMenuItemDto) {
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    if (!merchant) {
      throw new BadRequestException('User is not a merchant');
    }
    // Verify menu belongs to merchant
    const menu = await this.menusService.getMenuById(dto.menu_id);
    if (menu.merchant_id !== merchant.id) {
      throw new BadRequestException('Menu does not belong to merchant');
    }
    return this.menusService.addMenuItem(dto.menu_id, dto.name, dto.price);
  }
}
