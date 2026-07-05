import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommissionRule,
  CommissionActor,
} from '../entities/commission-rule.entity';
import { ServiceType } from '../entities/pricing-rule.entity';

/**
 * CommissionService - Manages commission calculations from database rules
 *
 * Provides configurable commission rates for:
 * - Rides: Driver commission (percentage of fare)
 * - Delivery: Merchant commission (percentage of subtotal)
 * - Delivery: Courier payout (delivery fee, no commission)
 */
@Injectable()
export class CommissionService {
  constructor(
    @InjectRepository(CommissionRule)
    private readonly commissionRuleRepository: Repository<CommissionRule>,
  ) {}

  /**
   * Get active commission rule for a service type and actor
   */
  private async getActiveRule(
    serviceType: ServiceType,
    actor: CommissionActor,
  ): Promise<CommissionRule | null> {
    return this.commissionRuleRepository.findOne({
      where: {
        service_type: serviceType,
        actor,
        active: true,
      },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get ride commission rate (percentage)
   * @returns Commission rate as decimal (e.g., 0.14 for 14%)
   */
  async getRideCommissionRate(): Promise<number> {
    const rule = await this.getActiveRule(
      ServiceType.RIDE,
      CommissionActor.DRIVER,
    );
    if (!rule || rule.percentage === null) {
      // Default fallback
      return 0.14; // 14%
    }
    return Number(rule.percentage);
  }

  /**
   * Calculate ride commission amount
   * Rounds UP in Nexa's favor to ensure we never lose money due to rounding
   * @param fare Total fare amount
   * @returns Commission amount in MAD (rounded up to 2 decimal places)
   */
  async calculateRideCommission(fare: number): Promise<number> {
    const rate = await this.getRideCommissionRate();
    const commission = fare * rate;
    // Round UP in Nexa's favor (always round commission up)
    return Math.ceil(commission * 100) / 100;
  }

  /**
   * Get merchant commission rate for delivery orders
   * @returns Commission rate as decimal (e.g., 0.22 for 22%)
   */
  async getMerchantCommissionRate(): Promise<number> {
    const rule = await this.getActiveRule(
      ServiceType.DELIVERY,
      CommissionActor.MERCHANT,
    );
    if (!rule || rule.percentage === null) {
      // Default fallback
      return 0.22; // 22%
    }
    return Number(rule.percentage);
  }

  /**
   * Calculate merchant commission amount
   * Rounds UP in Nexa's favor to ensure we never lose money due to rounding
   * @param subtotal Order subtotal (before commission)
   * @returns Commission amount in MAD (rounded up to 2 decimal places)
   */
  async calculateMerchantCommission(subtotal: number): Promise<number> {
    const rate = await this.getMerchantCommissionRate();
    const commission = subtotal * rate;
    // Round UP in Nexa's favor (always round commission up)
    return Math.ceil(commission * 100) / 100;
  }

  /**
   * Get courier flat fee (if any)
   * Currently couriers don't pay commission, they receive delivery fee
   * This method is for future use if we add courier fees
   */
  async getCourierFee(): Promise<number> {
    const rule = await this.getActiveRule(
      ServiceType.DELIVERY,
      CommissionActor.COURIER,
    );
    if (!rule || rule.flat_fee === null) {
      return 0;
    }
    return Number(rule.flat_fee);
  }

  /**
   * Get commission metadata for ledger transactions
   * Ensures fare = driver_earnings + commission exactly (no rounding errors)
   */
  async getRideCommissionMetadata(fare: number): Promise<{
    commission_rate: number;
    commission_amount: number;
    driver_earnings: number;
  }> {
    const rate = await this.getRideCommissionRate();
    // Round commission UP in Nexa's favor
    const commission = await this.calculateRideCommission(fare);
    // Round driver earnings DOWN to ensure fare = driver_earnings + commission exactly
    // This ensures we never lose money due to rounding
    const driverEarnings = Math.floor((fare - commission) * 100) / 100;

    return {
      commission_rate: rate,
      commission_amount: commission,
      driver_earnings: driverEarnings,
    };
  }

  /**
   * Get delivery commission metadata for ledger transactions
   * Ensures subtotal = merchant_payout + merchant_commission exactly
   */
  async getDeliveryCommissionMetadata(
    subtotal: number,
    deliveryFee: number,
  ): Promise<{
    merchant_commission_rate: number;
    merchant_commission: number;
    merchant_payout: number;
    courier_payout: number;
    platform_revenue: number;
  }> {
    const merchantRate = await this.getMerchantCommissionRate();
    // Round commission UP in Nexa's favor
    const merchantCommission = await this.calculateMerchantCommission(subtotal);
    // Round merchant payout DOWN to ensure subtotal = merchant_payout + commission exactly
    const merchantPayout =
      Math.floor((subtotal - merchantCommission) * 100) / 100;
    const courierPayout = deliveryFee; // Courier gets full delivery fee
    const platformRevenue = merchantCommission; // Already rounded up

    return {
      merchant_commission_rate: merchantRate,
      merchant_commission: merchantCommission,
      merchant_payout: merchantPayout,
      courier_payout: courierPayout,
      platform_revenue: platformRevenue,
    };
  }
}
