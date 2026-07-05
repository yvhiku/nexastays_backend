import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { DeliveryTransaction } from './entities/delivery-transaction.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { LedgerPostingService } from '../../ledger/ledger-posting.service';
import { LedgerService } from '../../ledger/ledger.service';
import { EntryType } from '../../ledger/entities/ledger-entry.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { CommissionService } from '../../go-taxi/commissions/commissions.service';

/**
 * PayoutsService - Handles order payment processing via LedgerService
 *
 * CRITICAL: This service NEVER stores balances or manipulates wallets directly.
 * All money postings go through LedgerPostingService (validated journals).
 *
 * Payment breakdown:
 * - Customer pays: total_amount (subtotal + delivery_fee + platform_fee)
 * - Merchant receives: subtotal - merchant_commission
 * - Courier receives: delivery_fee
 * - Platform receives: merchant_commission (from subtotal)
 */
@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(DeliveryTransaction)
    private readonly deliveryTransactionRepository: Repository<DeliveryTransaction>,
    @InjectRepository(AppTransaction)
    private readonly appTxRepository: Repository<AppTransaction>,
    private readonly ledgerService: LedgerService,
    private readonly commissionService: CommissionService,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  /**
   * Process order payment (PRIVATE METHOD - called only by OrdersService)
   *
   * This method:
   * 1. Debits customer wallet (total_amount)
   * 2. Credits merchant wallet (subtotal - platform_fee)
   * 3. Credits courier wallet (delivery_fee)
   * 4. Credits Nexa platform account (platform_fee)
   * 5. Records transaction in go_delivery.delivery_transactions
   *
   * All operations are atomic via LedgerService.runInLedgerTransaction()
   *
   * @param orderId Order ID to process payment for
   * @returns DeliveryTransaction record
   */
  async processOrderPayment(orderId: string): Promise<DeliveryTransaction> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'merchant', 'merchant.user', 'courier'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Order must be delivered before processing payment',
      );
    }

    if (!order.courier_id) {
      throw new BadRequestException('Order has no assigned courier');
    }
    // Capture for TS narrowing inside nested callbacks
    const courierId = order.courier_id;

    // Check if already processed
    const existing = await this.deliveryTransactionRepository.findOne({
      where: { order_id: orderId },
    });
    if (existing) {
      return existing; // Idempotent - return existing transaction
    }

    const totalAmount = order.total_amount;
    const subtotal = order.subtotal;
    const deliveryFee = order.delivery_fee;

    // Calculate merchant commission using CommissionService
    const commissionMetadata =
      await this.commissionService.getDeliveryCommissionMetadata(
        subtotal,
        deliveryFee,
      );
    const merchantCommission = commissionMetadata.merchant_commission;
    const merchantAmount = commissionMetadata.merchant_payout;
    const courierAmount = commissionMetadata.courier_payout;
    const platformRevenue = commissionMetadata.platform_revenue;

    // Use ledger transaction for atomicity
    return this.ledgerService.runInLedgerTransaction(async (manager) => {
      // Get customer wallet
      const customerWallet = await manager
        .getRepository(Wallet)
        .findOne({ where: { user_id: order.customer_id } });
      if (!customerWallet) {
        throw new NotFoundException('Customer wallet not found');
      }

      // Get merchant wallet
      const merchantWallet = await manager
        .getRepository(Wallet)
        .findOne({ where: { user_id: order.merchant.user_id } });
      if (!merchantWallet) {
        throw new NotFoundException('Merchant wallet not found');
      }

      // Get courier wallet
      const courierWallet = await manager
        .getRepository(Wallet)
        .findOne({ where: { user_id: courierId } });
      if (!courierWallet) {
        throw new NotFoundException('Courier wallet not found');
      }

      // Get or create ledger accounts
      const customerAccount = await this.ledgerService.getOrCreateWalletAccount(
        customerWallet.id,
        manager,
      );
      const merchantAccount = await this.ledgerService.getOrCreateWalletAccount(
        merchantWallet.id,
        manager,
      );
      const courierAccount = await this.ledgerService.getOrCreateWalletAccount(
        courierWallet.id,
        manager,
      );
      const platformAccount = await this.ledgerService.getOrCreateSystemAccount(
        manager,
        'FEES',
      );

      // Check customer balance
      const customerBalance = await this.ledgerService.getBalance(
        customerAccount.id,
        manager,
      );
      if (customerBalance < totalAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      const ledgerReference = `DELIVERY_ORDER_${orderId}`;
      const ledgerMeta = {
        service: 'GO_DELIVERY',
        order_id: orderId,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: totalAmount,
        merchant_commission_rate: commissionMetadata.merchant_commission_rate,
        merchant_commission: merchantCommission,
        merchant_payout: merchantAmount,
        courier_payout: courierAmount,
        platform_revenue: platformRevenue,
      };

      const ledgerTxn = await this.ledgerPostingService.postJournal(manager, {
        idempotencyKey: `go_delivery:payment:${orderId}`,
        reference: ledgerReference.slice(0, 64),
        description: `GO_DELIVERY order ${orderId}`,
        metadata: ledgerMeta,
        lines: [
          {
            accountId: customerAccount.id,
            entryType: EntryType.DEBIT,
            amount: totalAmount,
          },
          {
            accountId: merchantAccount.id,
            entryType: EntryType.CREDIT,
            amount: merchantAmount,
          },
          {
            accountId: courierAccount.id,
            entryType: EntryType.CREDIT,
            amount: courierAmount,
          },
          {
            accountId: platformAccount.id,
            entryType: EntryType.CREDIT,
            amount: merchantCommission,
          },
        ],
      });

      const totalCredited = merchantAmount + courierAmount + merchantCommission;
      if (Math.abs(totalCredited - totalAmount) > 0.01) {
        throw new BadRequestException(
          `Payment amounts don't match: total_amount=${totalAmount}, sum=${totalCredited}`,
        );
      }

      await manager.getRepository(AppTransaction).save({
        sender_user_id: order.customer_id,
        receiver_user_id: null,
        amount: totalAmount,
        type: 'FOOD_ORDER',
        status: 'COMPLETED',
        reference: `ORDER-${orderId}`,
        ledger_transaction_id: ledgerTxn.id,
      });

      const deliveryTransaction = manager
        .getRepository(DeliveryTransaction)
        .create({
          order_id: orderId,
          ledger_transaction_id: ledgerTxn.id,
        });

      return manager
        .getRepository(DeliveryTransaction)
        .save(deliveryTransaction);
    });
  }

  /**
   * Get transaction by order ID
   */
  async getTransactionByOrderId(
    orderId: string,
  ): Promise<DeliveryTransaction | null> {
    return this.deliveryTransactionRepository.findOne({
      where: { order_id: orderId },
      relations: ['ledger_transaction'],
    });
  }
}
