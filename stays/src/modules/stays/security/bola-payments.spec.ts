import { ConflictException, NotFoundException } from '@nestjs/common';
import { StaysPaymentsService } from '../payments/stays-payments.service';

function createService(deps: {
  bookingRepo?: { findOne: jest.Mock };
  intentRepo?: { findOne: jest.Mock; create?: jest.Mock; save?: jest.Mock };
}) {
  const intentRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    ...deps.intentRepo,
  };

  return new StaysPaymentsService(
    {} as never,
    intentRepo as never,
    {} as never,
    (deps.bookingRepo ?? { findOne: jest.fn() }) as never,
    {} as never,
    {} as never,
    {
      isListingAvailable: jest.fn().mockResolvedValue(true),
    } as never,
    {} as never,
    {} as never,
  );
}

describe('BOLA — payment intent ownership', () => {
  it('does not create intent for another guest booking', async () => {
    const service = createService({
      bookingRepo: {
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
      },
    });

    await expect(
      service.createOrGetIntent('booking-b', 'guest-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects zero-total bookings', async () => {
    const service = createService({
      bookingRepo: {
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
      },
    });

    await expect(service.createOrGetIntent('booking-a', 'guest-a')).rejects.toThrow(
      /greater than zero/i,
    );
  });

  it('returns existing pending intent instead of creating a duplicate', async () => {
    const pendingIntent = {
      id: 'intent-1',
      booking_id: 'booking-a',
      provider: 'cmi',
      provider_intent_id: 'pi-1',
      amount: 500,
      currency: 'MAD',
      status: 'PENDING',
      idempotency_key: 'key-a',
    };

    const service = createService({
      bookingRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'booking-a',
          guest_user_id: 'guest-a',
          listing_id: 'listing-1',
          status: 'PAYMENT_PENDING',
          total_paid: 500,
          currency: 'MAD',
          checkin_date: '2026-08-01',
          checkout_date: '2026-08-03',
        }),
      },
      intentRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(pendingIntent),
      },
    });

    const result = await service.createOrGetIntent('booking-a', 'guest-a', 'key-a');

    expect(result.id).toBe('intent-1');
    expect(result.status).toBe('PENDING');
  });

  it('rejects a second intent when another payment is already in progress', async () => {
    const service = createService({
      bookingRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'booking-a',
          guest_user_id: 'guest-a',
          listing_id: 'listing-1',
          status: 'PAYMENT_PENDING',
          total_paid: 500,
          currency: 'MAD',
          checkin_date: '2026-08-01',
          checkout_date: '2026-08-03',
        }),
      },
      intentRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'intent-1',
            booking_id: 'booking-a',
            status: 'PENDING',
            idempotency_key: 'other-key',
          }),
      },
    });

    await expect(
      service.createOrGetIntent('booking-a', 'guest-a', 'new-key'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Payment webhook idempotency', () => {
  it('skips duplicate success webhooks when intent is already succeeded', async () => {
    const intentRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'intent-1',
        booking_id: 'booking-a',
        status: 'SUCCEEDED',
        amount: 500,
        provider: 'cmi',
        provider_intent_id: 'pi-1',
      }),
    };

    const transaction = jest.fn(async (cb) =>
      cb({
        getRepository: () => ({
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: jest.fn().mockResolvedValue({
                  id: 'intent-1',
                  booking_id: 'booking-a',
                  status: 'SUCCEEDED',
                  amount: 500,
                }),
              }),
            }),
          }),
          findOne: jest.fn(),
          update: jest.fn(),
          save: jest.fn(),
        }),
      }),
    );

    const service = new StaysPaymentsService(
      { transaction } as never,
      intentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.handleWebhookSuccess('cmi', 'pi-1');

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
