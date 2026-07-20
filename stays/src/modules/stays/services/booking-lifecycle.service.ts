import { Injectable } from '@nestjs/common';
import { StaysBooking } from '../entities/stays-booking.entity';

export type BookingLifecycle =
  | 'UPCOMING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'PENDING_PAYMENT'
  | 'CANCELLED'
  | 'EXPIRED';

export interface BookingLifecycleContext {
  now?: Date;
  paymentFailed?: boolean;
  paymentExpired?: boolean;
}

const CANCELLED_STATUSES: StaysBooking['status'][] = [
  'CANCELLED_BY_GUEST',
  'CANCELLED_BY_HOST',
];

const PAID_STAY_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
];

/** Default payment hold window (minutes) before a pending booking expires. */
export const PAYMENT_PENDING_TTL_MINUTES = Number(
  process.env.STAYS_PAYMENT_PENDING_TTL_MINUTES ?? 60,
);

/** Days after checkout when guests may still file a complaint. */
export const COMPLAINT_WINDOW_DAYS = Number(
  process.env.STAYS_COMPLAINT_WINDOW_DAYS ?? 14,
);

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseDateOnly(value: Date | string): Date {
  const d = new Date(value);
  return startOfDay(d);
}

@Injectable()
export class BookingLifecycleService {
  getPaymentExpiresAt(createdAt: Date): Date {
    return new Date(
      createdAt.getTime() + PAYMENT_PENDING_TTL_MINUTES * 60 * 1000,
    );
  }

  isPaymentExpired(booking: StaysBooking, now = new Date()): boolean {
    if (booking.status !== 'PAYMENT_PENDING' && booking.status !== 'INITIATED') {
      return false;
    }
    return this.getPaymentExpiresAt(booking.created_at) <= now;
  }

  computeLifecycle(
    booking: StaysBooking,
    ctx: BookingLifecycleContext = {},
  ): BookingLifecycle {
    const now = ctx.now ?? new Date();
    const today = startOfDay(now);
    const checkin = parseDateOnly(booking.checkin_date);
    const checkout = parseDateOnly(booking.checkout_date);

    if (booking.status === 'EXPIRED' || ctx.paymentExpired) {
      return 'EXPIRED';
    }

    if (CANCELLED_STATUSES.includes(booking.status)) {
      return 'CANCELLED';
    }

    if (
      booking.status === 'PAYMENT_PENDING' ||
      booking.status === 'INITIATED'
    ) {
      if (this.isPaymentExpired(booking, now)) {
        return 'EXPIRED';
      }
      return 'PENDING_PAYMENT';
    }

    if (booking.status === 'COMPLETED') {
      return 'COMPLETED';
    }

    if (PAID_STAY_STATUSES.includes(booking.status)) {
      if (today >= checkout) {
        return 'COMPLETED';
      }
      if (today >= checkin && today < checkout) {
        return 'ACTIVE';
      }
      if (today < checkin) {
        return 'UPCOMING';
      }
    }

    return 'CANCELLED';
  }

  /**
   * Guest may leave a review after checkout (COMPLETED), unless reviewing own listing.
   * Follow-on (not implemented): schedule 24h + 3-day “How was your stay?” reminders,
   * then stop — email/in-app once the notification stack exists.
   */
  canReview(booking: StaysBooking, ctx: BookingLifecycleContext = {}): boolean {
    if (this.computeLifecycle(booking, ctx) !== 'COMPLETED') {
      return false;
    }
    const hostId = (booking.listing as { host_user_id?: string } | undefined)
      ?.host_user_id;
    if (hostId && hostId === booking.guest_user_id) {
      return false;
    }
    return true;
  }

  canComplain(booking: StaysBooking, ctx: BookingLifecycleContext = {}): boolean {
    const lifecycle = this.computeLifecycle(booking, ctx);
    if (lifecycle !== 'COMPLETED' && lifecycle !== 'ACTIVE') {
      return false;
    }
    const checkout = parseDateOnly(booking.checkout_date);
    const deadline = new Date(checkout);
    deadline.setDate(deadline.getDate() + COMPLAINT_WINDOW_DAYS);
    const today = startOfDay(ctx.now ?? new Date());
    return today <= deadline;
  }

  canCancel(booking: StaysBooking, ctx: BookingLifecycleContext = {}): boolean {
    const lifecycle = this.computeLifecycle(booking, ctx);
    if (lifecycle === 'PENDING_PAYMENT') return true;
    if (lifecycle === 'UPCOMING') return true;
    return false;
  }

  lifecycleBadgeColor(lifecycle: BookingLifecycle): string {
    switch (lifecycle) {
      case 'UPCOMING':
        return 'blue';
      case 'ACTIVE':
        return 'green';
      case 'PENDING_PAYMENT':
        return 'orange';
      case 'COMPLETED':
        return 'gray';
      case 'CANCELLED':
      case 'EXPIRED':
        return 'red';
      default:
        return 'gray';
    }
  }
}
