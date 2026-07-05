import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MerchantsService } from '../merchants/merchants.service';

@Injectable()
export class MenusService {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    private readonly merchantsService: MerchantsService,
  ) {}

  /**
   * Create a menu for a merchant
   */
  async createMenu(merchantId: string, name: string): Promise<Menu> {
    const merchant = await this.merchantsService.getMerchantById(merchantId);

    const menu = this.menuRepository.create({
      merchant_id: merchantId,
      name,
      is_active: true,
    });

    return this.menuRepository.save(menu);
  }

  /**
   * Get menu by ID
   */
  async getMenuById(menuId: string): Promise<Menu> {
    const menu = await this.menuRepository.findOne({
      where: { id: menuId },
      relations: ['merchant', 'items'],
    });
    if (!menu) {
      throw new NotFoundException('Menu not found');
    }
    return menu;
  }

  /**
   * Get all active menus for a merchant
   */
  async getMerchantMenus(merchantId: string): Promise<Menu[]> {
    return this.menuRepository.find({
      where: { merchant_id: merchantId, is_active: true },
      relations: ['items'],
    });
  }

  /**
   * Add item to menu
   */
  async addMenuItem(
    menuId: string,
    name: string,
    price: number,
  ): Promise<MenuItem> {
    const menu = await this.getMenuById(menuId);

    const item = this.menuItemRepository.create({
      menu_id: menuId,
      name,
      price,
      is_available: true,
    });

    return this.menuItemRepository.save(item);
  }

  /**
   * Get menu item by ID
   */
  async getMenuItemById(itemId: string): Promise<MenuItem> {
    const item = await this.menuItemRepository.findOne({
      where: { id: itemId },
      relations: ['menu'],
    });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  /**
   * Update menu item availability
   */
  async updateItemAvailability(
    itemId: string,
    isAvailable: boolean,
  ): Promise<MenuItem> {
    const item = await this.getMenuItemById(itemId);
    item.is_available = isAvailable;
    return this.menuItemRepository.save(item);
  }

  /**
   * Get merchant menu with all items (for consumers)
   */
  async getMerchantMenu(merchantId: string): Promise<Menu[]> {
    // Verify merchant exists
    await this.merchantsService.getMerchantById(merchantId);

    // Get all active menus with available items
    const menus = await this.menuRepository.find({
      where: { merchant_id: merchantId, is_active: true },
      relations: ['items'],
      order: { created_at: 'ASC' },
    });

    // Filter to only show available items
    return menus.map((menu) => ({
      ...menu,
      items: menu.items.filter((item) => item.is_available),
    }));
  }
}
