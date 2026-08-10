import { StaysPaymentsService } from './stays-payments.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const LISTING_ID = '22222222-2222-2222-2222-222222222222';
const INTENT_ID = '33333333-3333-3333-3333-333333333333';
const PROVIDER_INTENT_ID = 'mock_concurrency_intent';

function baseBooking(status: StaysBooking['status']): StaysBooking {
  return {
    id: BOOKING_ID,
    listing_id: LISTING_ID,
    guest_user_id: 'guest-1',
    status,
    total_paid: 525,
    guest_fee: 25,
    host_fee: 25,
    payout_amount: 475,
    currency: 'MAD',
    checkin_date: new Date('2026-09-01'),
    checkout_date: new Date('2026-09-03'),
  } as StaysBooking;
}

function pendingIntent(): StaysPaymentIntent {
  return {
    id: INTENT_ID,
    booking_id: BOOKING_ID,
    provider: 'mock',
    provider_intent_id: PROVIDER_INTENT_ID,
    amount: 525,
    currency: 'MAD',
    status: 'PENDING',
  } as StaysPaymentIntent;
}

function buildConfirmTransactionMock(options: {
  booking: StaysBooking;
  intent?: StaysPaymentIntent;
  ledgerFindOne?: jest.Mock;
  ledgerSave?: jest.Mock;
  bookingUpdate?: jest.Mock;
}) {
  const intent = options.intent ?? pendingIntent();
  const ledgerSave = options.ledgerSave ?? jest.fn().mockResolvedValue(undefined);
  const ledgerFindOne =
    options.ledgerFindOne ?? jest.fn().mockResolvedValue(null);
  const intentUpdate = jest.fn().mockResolvedValue(undefined);
  const bookingUpdate =
    options.bookingUpdate ?? jest.fn().mockResolvedValue({ affected: 1 });

  const transaction = jest.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === StaysPaymentIntent) {
          return {
            createQueryBuilder: () => ({
              setLock: () => ({
                where: () => ({
                  getOne: jest.fn().mockResolvedValue({ ...intent }),
                }),
              }),
            }),
            update: intentUpdate,
          };
        }
        if (entity === StaysLedgerEntry) {
          return {
            findOne: ledgerFindOne,
            save: ledgerSave,
            create: (d: object) => d,
          };
        }
        if (entity === StaysBooking) {
          return {
            createQueryBuilder: () => ({
              setLock: () => ({
                leftJoinAndSelect: () => ({
                  where: () => ({
                    getOne: jest
                      .fn()
                      .mockResolvedValue({ ...options.booking, listing: { id: LISTING_ID } }),
                  }),
                }),
              }),
            }),
            update: bookingUpdate,
          };
        }
        return {
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({ getOne: jest.fn().mockResolvedValue({ id: LISTING_ID }) }),
            }),
          }),
        };
      },
    };
    return cb(manager);
  });

  return { transaction, ledgerSave, bookingUpdate, intentUpdate };
}

function createPaymentsService(transaction: jest.Mock): StaysPaymentsService {
  return new StaysPaymentsService(
    { transaction } as never,
    {
      findOne: jest.fn().mockResolvedValue({
        id: INTENT_ID,
        booking_id: BOOKING_ID,
        provider: 'mock',
        provider_intent_id: PROVIDER_INTENT_ID,
        status: 'PENDING',
        amount: 525,
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    { isListingAvailable: jest.fn().mockResolvedValue(true) } as never,
    { provisionWithinTransaction: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
  );
}

describe('Booking state concurrency — payment confirmation', () => {
  it('Test 1 — PAYMENT_PENDING payment confirmation → CONFIRMED with ledger', async () => {
    const { transaction, ledgerSave, bookingUpdate } = buildConfirmTransactionMock({
      booking: baseBooking('PAYMENT_PENDING'),
    });
    const service = createPaymentsService(transaction);

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);

    expect(outcome).toBe('CONFIRMED');
    expect(bookingUpdate).toHaveBeenCalledWith(
      { id: BOOKING_ID, status: 'PAYMENT_PENDING' },
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
    expect(ledgerSave).toHaveBeenCalledTimes(1);
  });

  it('Test 2 — EXPIRED booking rejects payment confirmation without success ledger', async () => {
    const ledgerSave = jest.fn();
    const { transaction } = buildConfirmTransactionMock({
      booking: baseBooking('EXPIRED'),
      ledgerSave,
    });
    const service = createPaymentsService(transaction);

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);

    expect(outcome).toBe('BOOKING_NOT_PAYABLE');
    expect(ledgerSave).not.toHaveBeenCalled();
  });

  it('Test 3 — CANCELLED booking rejects payment confirmation without success ledger', async () => {
    const ledgerSave = jest.fn();
    const { transaction } = buildConfirmTransactionMock({
      booking: baseBooking('CANCELLED_BY_GUEST'),
      ledgerSave,
    });
    const service = createPaymentsService(transaction);

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);

    expect(outcome).toBe('BOOKING_NOT_PAYABLE');
    expect(ledgerSave).not.toHaveBeenCalled();
  });

  it('CONFIRMED booking with pending intent → ALREADY_PROCESSED without new ledger', async () => {
    const ledgerSave = jest.fn();
    const { transaction } = buildConfirmTransactionMock({
      booking: baseBooking('CONFIRMED'),
      intent: { ...pendingIntent(), status: 'PENDING' },
      ledgerSave,
    });
    const service = createPaymentsService(transaction);

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);

    expect(outcome).toBe('ALREADY_PROCESSED');
    expect(ledgerSave).not.toHaveBeenCalled();
  });

  it('guarded confirm update with zero affected rows → BOOKING_NOT_PAYABLE', async () => {
    const ledgerSave = jest.fn();
    const { transaction } = buildConfirmTransactionMock({
      booking: baseBooking('PAYMENT_PENDING'),
      ledgerSave,
      bookingUpdate: jest.fn().mockResolvedValue({ affected: 0 }),
    });
    const service = createPaymentsService(transaction);

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);

    expect(outcome).toBe('BOOKING_NOT_PAYABLE');
    expect(ledgerSave).not.toHaveBeenCalled();
  });
});
