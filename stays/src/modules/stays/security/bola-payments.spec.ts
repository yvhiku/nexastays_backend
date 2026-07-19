import { NotFoundException } from '@nestjs/common';
import { StaysPaymentsService } from '../payments/stays-payments.service';

describe('BOLA — payment intent ownership', () => {
  it('does not create intent for another guest booking', async () => {
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'booking-b',
        guest_user_id: 'guest-b',
        listing_id: 'listing-1',
        status: 'PAYMENT_PENDING',
        total_paid: 500,
        currency: 'MAD',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
      }),
    };
    const service = new StaysPaymentsService(
      {} as never,
      {} as never,
      {} as never,
      bookingRepo as never,
      {} as never,
      {} as never,
      {
        isListingAvailable: jest.fn().mockResolvedValue(true),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createOrGetIntent('booking-b', 'guest-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects zero-total bookings', async () => {
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'booking-a',
        guest_user_id: 'guest-a',
        listing_id: 'listing-1',
        status: 'PAYMENT_PENDING',
        total_paid: 0,
        currency: 'MAD',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
      }),
    };
    const service = new StaysPaymentsService(
      {} as never,
      {} as never,
      {} as never,
      bookingRepo as never,
      {} as never,
      {} as never,
      {
        isListingAvailable: jest.fn().mockResolvedValue(true),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.createOrGetIntent('booking-a', 'guest-a')).rejects.toThrow(
      /greater than zero/i,
    );
  });
});
