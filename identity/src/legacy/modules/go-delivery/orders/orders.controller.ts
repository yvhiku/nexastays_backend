import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { MerchantsService } from '../merchants/merchants.service';
import { CouriersService } from '../couriers/couriers.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '../enums/order-status.enum';

@ApiTags('Go Deliveries')
@Controller('go/delivery/orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly merchantsService: MerchantsService,
    private readonly couriersService: CouriersService,
  ) {}

  /**
   * Create a new order (Customer)
   * POST /go/delivery/orders
   */
  @Post()
  @UseGuards(AccountTypeGuard)
  @AccountTypes('CONSUMER')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const order = await this.ordersService.createOrder(
      user.userId,
      dto.merchant_id,
      dto.items,
      dto.delivery_lat,
      dto.delivery_lng,
    );
    return order;
  }

  /**
   * Get customer orders
   * GET /go/delivery/orders/customer
   */
  @Get('customer')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('CONSUMER')
  async getCustomerOrders(@CurrentUser() user: any) {
    return this.ordersService.listConsumerOrders(
      user.userId,
      user.account_type,
    );
  }

  /**
   * Get consumer orders (explicit)
   * GET /go/delivery/orders/my
   */
  @Get('my')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('CONSUMER')
  async getMyOrders(
    @CurrentUser() user: any,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.listConsumerOrders(
      user.userId,
      user.account_type,
      status,
    );
  }

  /**
   * Get merchant orders
   * GET /go/delivery/orders/merchant
   */
  @Get('merchant')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('MERCHANT')
  async getMerchantOrders(
    @CurrentUser() user: any,
    @Query('status') status?: OrderStatus,
  ) {
    console.log('[OrdersController][getMerchantOrders] user:', {
      userId: user.userId,
      account_type: user.account_type,
    });
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    console.log(
      '[OrdersController][getMerchantOrders] merchant:',
      merchant
        ? { id: merchant.id, name: merchant.name, user_id: merchant.user_id }
        : null,
    );
    if (!merchant) {
      throw new BadRequestException(
        `User is not a merchant. User ID: ${user.userId}, Account Type: ${user.account_type}. ` +
          `Please ensure the merchant record exists and is linked to a user with account_type = 'MERCHANT'.`,
      );
    }
    return this.ordersService.listMerchantOrders(
      merchant.id,
      user.account_type,
      status,
    );
  }

  /**
   * List orders (Admin only)
   * GET /go/delivery/orders
   */
  @Get()
  @UseGuards(AccountTypeGuard)
  @AccountTypes('ADMIN')
  async listOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.listOrders(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Get available orders for couriers (READY_FOR_PICKUP status, no courier assigned)
   * GET /go/delivery/orders/available
   */
  @Get('available')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async getAvailableOrders(@CurrentUser() user: any) {
    return this.ordersService.listCourierAvailableOrders(user.account_type);
  }

  /**
   * Get courier's orders
   * GET /go/delivery/orders/my-orders
   */
  @Get('my-orders')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async getCourierOrders(@CurrentUser() user: any) {
    return this.ordersService.listCourierAssignedOrders(
      user.userId,
      user.account_type,
    );
  }

  /**
   * Get courier assigned orders
   * GET /go/delivery/orders/assigned
   */
  @Get('assigned')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async getCourierAssignedOrders(
    @CurrentUser() user: any,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.listCourierAssignedOrders(
      user.userId,
      user.account_type,
      status,
    );
  }

  /**
   * Get courier order history (delivered/completed orders)
   * GET /go/delivery/orders/history
   * IMPORTANT: This must come BEFORE @Get(':id') to avoid route conflicts
   */
  @Get('history')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async getCourierOrderHistory(@CurrentUser() user: any) {
    return this.ordersService.listCourierOrderHistory(user.userId);
  }

  /**
   * Get order details (Customer, Merchant, Courier, or Admin)
   * GET /go/delivery/orders/:id
   * IMPORTANT: This must come AFTER all specific routes like /history, /assigned, etc.
   */
  @Get(':id')
  async getOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    // Validate that orderId is a valid UUID format to avoid matching "history", "assigned", etc.
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      throw new BadRequestException(
        `Invalid order ID format: "${orderId}". Expected a valid UUID.`,
      );
    }

    // Admin can view any order without userId check
    const userId = user.account_type === 'ADMIN' ? undefined : user.userId;
    return this.ordersService.getOrderById(orderId, userId);
  }

  /**
   * Cancel order (Customer)
   * POST /go/delivery/orders/:id/cancel
   */
  @Post(':id/cancel')
  async cancelOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    return this.ordersService.cancelOrder(orderId, user.userId);
  }

  /**
   * Update order to PREPARING (Merchant)
   * POST /go/delivery/orders/:id/prepare
   */
  @Post(':id/prepare')
  async prepareOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    if (!merchant) {
      throw new BadRequestException('User is not a merchant');
    }
    return this.ordersService.updateOrderStatus(
      orderId,
      OrderStatus.PREPARING,
      user.userId,
    );
  }

  /**
   * Update order to READY_FOR_PICKUP (Merchant) - makes order visible to couriers
   * POST /go/delivery/orders/:id/ready
   */
  @Post(':id/ready')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('MERCHANT')
  async readyOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    const merchant = await this.merchantsService.getMerchantByUserId(
      user.userId,
    );
    if (!merchant) {
      throw new BadRequestException('User is not a merchant');
    }
    return this.ordersService.updateOrderStatus(
      orderId,
      OrderStatus.READY_FOR_PICKUP,
      user.userId,
    );
  }

  /**
   * Accept order (Courier)
   * POST /go/delivery/orders/:id/accept
   */
  @Post(':id/accept')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async acceptOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    console.log('[OrdersController][acceptOrder] Request:', {
      orderId,
      userId: user.userId,
      accountType: user.account_type,
    });

    try {
      // Verify user is a courier
      const courier = await this.couriersService.getCourierByUserId(
        user.userId,
      );
      console.log('[OrdersController][acceptOrder] Courier verified:', {
        courierId: courier?.id,
        userId: courier?.id,
      });

      const order = await this.ordersService.acceptOrder(orderId, user.userId);
      console.log('[OrdersController][acceptOrder] Order accepted:', {
        orderId: order.id,
        status: order.status,
        courierId: order.courier_id,
      });

      return order;
    } catch (error: any) {
      console.error('[OrdersController][acceptOrder] Error:', {
        orderId,
        userId: user.userId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Pickup order (Courier)
   * POST /go/delivery/orders/:id/pickup
   */
  @Post(':id/pickup')
  @UseGuards(AccountTypeGuard)
  @AccountTypes('COURIER')
  async pickupOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    console.log(
      `[OrdersController] Pickup order ${orderId.substring(0, 8)} for courier ${user.userId}`,
    );
    try {
      await this.couriersService.getCourierByUserId(user.userId);

      // Verify courier is assigned to this order
      const order = await this.ordersService.getOrderById(orderId, user.userId);
      if (order.courier_id !== user.userId) {
        throw new BadRequestException('You are not assigned to this order');
      }

      // Check if already picked up (idempotent)
      if (
        order.status === OrderStatus.PICKED_UP ||
        order.status === OrderStatus.ON_THE_WAY ||
        order.status === OrderStatus.DELIVERED
      ) {
        console.log(
          `[OrdersController] Order ${orderId.substring(0, 8)} already in status ${order.status}, returning as-is`,
        );
        return order;
      }

      const updatedOrder = await this.ordersService.updateOrderStatus(
        orderId,
        OrderStatus.PICKED_UP,
        user.userId,
      );
      console.log(
        `[OrdersController] Order ${orderId.substring(0, 8)} pickup successful. Status: ${updatedOrder.status}`,
      );
      return updatedOrder;
    } catch (error: any) {
      console.error(
        `[OrdersController] Pickup order ${orderId.substring(0, 8)} failed:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Deliver order (Courier) - transitions through ON_THE_WAY -> DELIVERED (triggers payment)
   * POST /go/delivery/orders/:id/deliver
   */
  @Post(':id/deliver')
  async deliverOrder(@CurrentUser() user: any, @Param('id') orderId: string) {
    await this.couriersService.getCourierByUserId(user.userId);

    // Get current order status (with userId to ensure relations are loaded)
    const order = await this.ordersService.getOrderById(orderId, user.userId);

    // Verify this courier is assigned to the order
    if (order.courier_id !== user.userId) {
      throw new BadRequestException('You are not assigned to this order');
    }

    try {
      // If order is PICKED_UP, first transition to ON_THE_WAY
      if (order.status === OrderStatus.PICKED_UP) {
        await this.ordersService.updateOrderStatus(
          orderId,
          OrderStatus.ON_THE_WAY,
          user.userId,
        );
      }

      // Mark as delivered
      await this.ordersService.updateOrderStatus(
        orderId,
        OrderStatus.DELIVERED,
        user.userId,
      );
      return this.ordersService.getOrderById(orderId, user.userId);
    } catch (error) {
      // Log the actual error for debugging
      console.error('Error in deliverOrder:', error);
      throw error;
    }
  }
}
