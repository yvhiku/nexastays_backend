import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { PricingService } from '../pricing/pricing.service';
import { MerchantsService } from '../merchants/merchants.service';
import { MenusService } from '../menus/menus.service';
import { PayoutsService } from '../payouts/payouts.service';
import { CommissionService } from '../../go-taxi/commissions/commissions.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(DeliveryEvent)
    private readonly deliveryEventRepository: Repository<DeliveryEvent>,
    private readonly pricingService: PricingService,
    private readonly merchantsService: MerchantsService,
    private readonly menusService: MenusService,
    private readonly payoutsService: PayoutsService,
    private readonly commissionService: CommissionService,
  ) {}

  /**
   * Create a new order
   */
  async createOrder(
    customerId: string,
    merchantId: string,
    items: Array<{ menu_item_id: string; quantity: number }>,
    deliveryLat: number,
    deliveryLng: number,
  ): Promise<Order> {
    // Verify merchant exists and is active
    const merchant = await this.merchantsService.getMerchantById(merchantId);

    // Fetch menu items and calculate subtotal
    const menuItems = await Promise.all(
      items.map((item) => this.menusService.getMenuItemById(item.menu_item_id)),
    );

    // Verify all items are available
    for (const item of menuItems) {
      if (!item.is_available) {
        throw new BadRequestException(
          `Menu item ${item.name} is not available`,
        );
      }
    }

    // Calculate pricing
    const itemPrices = items.map((item, index) => ({
      price: menuItems[index].price,
      quantity: item.quantity,
    }));
    const subtotal = this.pricingService.calculateSubtotal(itemPrices);

    // Calculate delivery fee (using merchant location - simplified MVP)
    // In production, use actual merchant address coordinates
    const merchantLat = 33.5731; // Default Casablanca
    const merchantLng = -7.5898;
    const distance = this.pricingService.calculateDistance(
      merchantLat,
      merchantLng,
      deliveryLat,
      deliveryLng,
    );
    const deliveryFee = this.pricingService.calculateDeliveryFee(distance);

    // Calculate platform fee using the same commission rate that will be used in payment
    // This ensures totalAmount matches the payment split
    const commissionMetadata =
      await this.commissionService.getDeliveryCommissionMetadata(
        subtotal,
        deliveryFee,
      );
    const platformFee = commissionMetadata.merchant_commission; // Use actual commission rate
    const totalAmount = this.pricingService.calculateTotal(
      subtotal,
      deliveryFee,
      platformFee,
    );

    // Create order
    const order = this.orderRepository.create({
      customer_id: customerId,
      merchant_id: merchantId,
      courier_id: null,
      status: OrderStatus.CREATED,
      subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      total_amount: totalAmount,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create order items
    const orderItems = items.map((item, index) =>
      this.orderItemRepository.create({
        order_id: savedOrder.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: menuItems[index].price,
      }),
    );
    await this.orderItemRepository.save(orderItems);

    // Log event
    await this.createDeliveryEvent(savedOrder.id, 'ORDER_CREATED', {
      subtotal,
      delivery_fee: deliveryFee,
      platform_fee: platformFee,
      total_amount: totalAmount,
    });

    return savedOrder;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId?: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
        'events',
      ],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Verify user has access (customer, merchant, or courier)
    if (userId) {
      if (
        order.customer_id !== userId &&
        order.merchant.user_id !== userId &&
        order.courier_id !== userId
      ) {
        throw new ForbiddenException('Access denied to this order');
      }
    }

    return order;
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.getOrderById(orderId, userId);

    // Only customer can cancel before preparation starts
    if (order.customer_id !== userId) {
      throw new ForbiddenException('Only customer can cancel order');
    }

    if (
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel order with status: ${order.status}`,
      );
    }

    if (
      order.status !== OrderStatus.CREATED &&
      order.status !== OrderStatus.ACCEPTED_BY_MERCHANT
    ) {
      throw new BadRequestException(
        'Order can only be cancelled before preparation starts',
      );
    }

    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    await this.createDeliveryEvent(orderId, 'ORDER_CANCELLED', {
      cancelled_by: userId,
    });

    return order;
  }

  /**
   * Update order status (for merchant/courier)
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<Order> {
    const order = await this.getOrderById(orderId);

    // Validate state transitions
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.CREATED]: [
        OrderStatus.ACCEPTED_BY_MERCHANT,
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.ACCEPTED_BY_MERCHANT]: [
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PREPARING]: [
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.READY_FOR_PICKUP]: [
        OrderStatus.PICKED_UP,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PICKED_UP]: [OrderStatus.ON_THE_WAY, OrderStatus.CANCELLED],
      [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!validTransitions[order.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${order.status} to ${status}`,
      );
    }

    // If already in the target status, return the order (idempotent)
    if (order.status === status) {
      console.log(
        `[OrdersService] Order ${orderId.substring(0, 8)} already in status ${status}, returning as-is`,
      );
      return order;
    }

    // Verify user has permission
    if (
      status === OrderStatus.ACCEPTED_BY_MERCHANT ||
      status === OrderStatus.PREPARING ||
      status === OrderStatus.READY_FOR_PICKUP
    ) {
      if (order.merchant.user_id !== userId) {
        throw new ForbiddenException(
          'Only merchant can update preparation status',
        );
      }
    }

    // Verify courier permissions for delivery-related statuses
    if (
      status === OrderStatus.PICKED_UP ||
      status === OrderStatus.ON_THE_WAY ||
      status === OrderStatus.DELIVERED
    ) {
      if (order.courier_id !== userId) {
        throw new ForbiddenException(
          'Only assigned courier can update delivery status',
        );
      }
    }

    order.status = status;
    if (status === OrderStatus.DELIVERED) {
      order.completed_at = new Date();
    }
    await this.orderRepository.save(order);

    // Trigger payment when completed
    if (status === OrderStatus.DELIVERED) {
      try {
        await this.payoutsService.processOrderPayment(orderId);
      } catch (error) {
        // Rollback order completion if payment fails
        order.status = OrderStatus.ON_THE_WAY;
        order.completed_at = null;
        await this.orderRepository.save(order);
        throw error;
      }
    }

    await this.createDeliveryEvent(orderId, `ORDER_${status}`, metadata || {});

    return order;
  }

  /**
   * List orders (Admin)
   */
  async listOrders(
    status?: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    data: Array<{
      id: string;
      merchant_id: string;
      merchant_name: string;
      courier_id: string | null;
      courier_name: string | null;
      customer_name: string;
      status: OrderStatus;
      total_amount: number;
      created_at: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [orders, total] = await this.orderRepository.findAndCount({
      where,
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    // Format orders for frontend
    const formattedOrders = orders.map((order) => ({
      id: order.id,
      merchant_id: order.merchant_id,
      merchant_name:
        order.merchant?.user?.full_name || order.merchant?.name || 'Unknown',
      courier_id: order.courier_id,
      courier_name: order.courier?.full_name || null,
      customer_name: order.customer?.full_name || 'Unknown',
      status: order.status,
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
    }));

    return {
      data: formattedOrders,
      total,
      page,
      limit,
    };
  }

  private buildListResponse(orders: Order[]) {
    const data = orders.map((order) => ({
      id: order.id,
      status: order.status,
      subtotal: Number(order.subtotal),
      delivery_fee: Number(order.delivery_fee),
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        name: item.menu_item?.name ?? null,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
      })),
      merchant: order.merchant
        ? {
            id: order.merchant.id,
            name: order.merchant.name,
            full_name: order.merchant.user?.full_name ?? null,
            phone_number: order.merchant.user?.phone_number ?? null,
          }
        : null,
      courier: order.courier
        ? {
            id: order.courier.id,
            full_name: order.courier.full_name ?? null,
            phone_number: order.courier.phone_number ?? null,
          }
        : null,
      customer: order.customer
        ? {
            id: order.customer.id,
            full_name: order.customer.full_name ?? null,
            phone_number: order.customer.phone_number ?? null,
          }
        : null,
    }));

    return {
      data,
      meta: {
        count: data.length,
      },
    };
  }

  async listConsumerOrders(
    consumerId: string,
    accountType: string,
    status?: OrderStatus,
  ) {
    console.log(
      `[GoDelivery][ConsumerOrders] userId=${consumerId} accountType=${accountType} status=${status ?? 'ALL'}`,
    );
    const where: any = { customer_id: consumerId };
    if (status) {
      where.status = status;
    }
    const orders = await this.orderRepository.find({
      where,
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
    console.log(`[GoDelivery][ConsumerOrders] count=${orders.length}`);
    return this.buildListResponse(orders);
  }

  async listMerchantOrders(
    merchantId: string,
    accountType: string,
    status?: OrderStatus,
  ) {
    console.log(
      `[GoDelivery][MerchantOrders] merchantId=${merchantId} accountType=${accountType} status=${status ?? 'ALL'}`,
    );
    const where: any = { merchant_id: merchantId };
    if (status) {
      where.status = status;
    }
    const orders = await this.orderRepository.find({
      where,
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
    console.log(`[GoDelivery][MerchantOrders] count=${orders.length}`);
    return this.buildListResponse(orders);
  }

  async listCourierAvailableOrders(accountType: string) {
    console.log(
      `[GoDelivery][CourierAvailable] accountType=${accountType} status=${OrderStatus.READY_FOR_PICKUP}`,
    );
    const orders = await this.orderRepository.find({
      where: {
        status: OrderStatus.READY_FOR_PICKUP,
        courier_id: IsNull(),
      },
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
    console.log(`[GoDelivery][CourierAvailable] count=${orders.length}`);
    return this.buildListResponse(orders);
  }

  async listCourierAssignedOrders(
    courierId: string,
    accountType: string,
    status?: OrderStatus,
  ) {
    console.log(
      `[GoDelivery][CourierAssigned] courierId=${courierId} accountType=${accountType} status=${status ?? 'ALL'}`,
    );
    const where: any = { courier_id: courierId };
    if (status) {
      where.status = status;
    }
    const orders = await this.orderRepository.find({
      where,
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
    console.log(`[GoDelivery][CourierAssigned] count=${orders.length}`);
    return this.buildListResponse(orders);
  }

  /**
   * Get customer orders
   */
  async getCustomerOrders(
    customerId: string,
    limit: number = 20,
  ): Promise<Order[]> {
    const orders = await this.orderRepository.find({
      where: { customer_id: customerId },
      relations: ['merchant', 'merchant.user', 'items', 'items.menu_item'],
      order: { created_at: 'DESC' },
      take: limit,
    });
    return orders;
  }

  /**
   * Get merchant orders
   */
  async getMerchantOrders(
    merchantId: string,
    limit: number = 20,
  ): Promise<Order[]> {
    return this.orderRepository.find({
      where: { merchant_id: merchantId },
      relations: ['customer', 'items', 'items.menu_item'],
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get available orders for couriers (READY_FOR_PICKUP status, no courier assigned)
   */
  async getAvailableOrders(): Promise<Order[]> {
    return this.orderRepository.find({
      where: {
        status: OrderStatus.READY_FOR_PICKUP,
        courier_id: IsNull(),
      },
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get courier order history (delivered orders)
   * Note: go-delivery module only has DELIVERED status (no COMPLETED)
   */
  async listCourierOrderHistory(courierId: string) {
    console.log(`[GoDelivery][CourierHistory] courierId=${courierId}`);
    const orders = await this.orderRepository.find({
      where: {
        courier_id: courierId,
        status: OrderStatus.DELIVERED,
      },
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'courier',
        'items',
        'items.menu_item',
      ],
      order: { completed_at: 'DESC', created_at: 'DESC' },
    });
    console.log(
      `[GoDelivery][CourierHistory] Found ${orders.length} DELIVERED orders for courier ${courierId}`,
    );
    if (orders.length > 0) {
      console.log(
        `[GoDelivery][CourierHistory] Sample order IDs: ${orders
          .slice(0, 3)
          .map((o) => o.id.substring(0, 8))
          .join(', ')}`,
      );
    }
    return this.buildListResponse(orders);
  }

  /**
   * Get courier orders
   */
  async getCourierOrders(courierId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { courier_id: courierId },
      relations: [
        'customer',
        'merchant',
        'merchant.user',
        'items',
        'items.menu_item',
      ],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Accept order (assign courier)
   */
  async acceptOrder(orderId: string, courierId: string): Promise<Order> {
    console.log('[OrdersService][acceptOrder] Request:', {
      orderId,
      courierId,
    });

    const order = await this.getOrderById(orderId);
    console.log('[OrdersService][acceptOrder] Order found:', {
      orderId: order.id,
      status: order.status,
      currentCourierId: order.courier_id,
      merchantId: order.merchant_id,
    });

    if (order.status !== OrderStatus.READY_FOR_PICKUP) {
      const errorMsg = `Order must be READY_FOR_PICKUP to accept. Current status: ${order.status}`;
      console.error('[OrdersService][acceptOrder] Invalid status:', errorMsg);
      throw new BadRequestException(errorMsg);
    }

    if (order.courier_id) {
      const errorMsg = `Order already has a courier assigned: ${order.courier_id}`;
      console.error('[OrdersService][acceptOrder] Already assigned:', errorMsg);
      throw new BadRequestException(errorMsg);
    }

    order.courier_id = courierId;
    await this.orderRepository.save(order);
    console.log('[OrdersService][acceptOrder] Order updated:', {
      orderId: order.id,
      courierId: order.courier_id,
    });

    // Don't automatically transition to PICKED_UP - courier needs to pick up first
    try {
      await this.createDeliveryEvent(orderId, 'COURIER_ASSIGNED', {
        courier_id: courierId,
      });
      console.log('[OrdersService][acceptOrder] Event created');
    } catch (eventError) {
      console.error(
        '[OrdersService][acceptOrder] Failed to create event:',
        eventError,
      );
      // Don't fail the whole operation if event creation fails
    }

    return order;
  }

  /**
   * Create delivery event (internal helper)
   */
  private async createDeliveryEvent(
    orderId: string,
    eventType: string,
    payload?: Record<string, any>,
  ): Promise<DeliveryEvent> {
    const event = this.deliveryEventRepository.create({
      order_id: orderId,
      event_type: eventType,
      payload: payload || null,
    });
    return this.deliveryEventRepository.save(event);
  }
}
