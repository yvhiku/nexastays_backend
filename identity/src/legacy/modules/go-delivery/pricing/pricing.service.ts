import { Injectable } from '@nestjs/common';

/**
 * PricingService - MVP delivery pricing calculation
 * Formula:
 * - subtotal = sum(items.price * quantity)
 * - delivery_fee = base_fee + (distance × per_km_rate)
 * - platform_fee = percentage of subtotal
 * - total_amount = subtotal + delivery_fee + platform_fee
 *
 * MVP Constants:
 * - base_delivery_fee: 5 MAD
 * - per_km_rate: 1.5 MAD/km
 * - platform_fee_rate: 0.15 (15%)
 */
@Injectable()
export class PricingService {
  private readonly BASE_DELIVERY_FEE = 5.0; // MAD
  private readonly PER_KM_RATE = 1.5; // MAD per kilometer
  private readonly PLATFORM_FEE_RATE = 0.15; // 15%

  /**
   * Calculate subtotal from order items
   */
  calculateSubtotal(items: Array<{ price: number; quantity: number }>): number {
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    return Math.round(subtotal * 100) / 100;
  }

  /**
   * Calculate delivery fee based on distance
   */
  calculateDeliveryFee(distanceKm: number): number {
    if (distanceKm < 0) {
      throw new Error('Distance must be non-negative');
    }
    const fee = this.BASE_DELIVERY_FEE + distanceKm * this.PER_KM_RATE;
    return Math.round(fee * 100) / 100;
  }

  /**
   * Calculate platform fee (percentage of subtotal)
   */
  calculatePlatformFee(subtotal: number): number {
    if (subtotal < 0) {
      throw new Error('Subtotal must be non-negative');
    }
    const fee = subtotal * this.PLATFORM_FEE_RATE;
    return Math.round(fee * 100) / 100;
  }

  /**
   * Calculate total amount
   */
  calculateTotal(
    subtotal: number,
    deliveryFee: number,
    platformFee: number,
  ): number {
    const total = subtotal + deliveryFee + platformFee;
    return Math.round(total * 100) / 100;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
