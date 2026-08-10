import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaysPaymentsService } from './stays-payments.service';
import { isLegacyMockWebhookEnabled } from './payment-provider.config';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const GUEST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GUEST_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LISTING_ID = '22222222-2222-2222-2222-222222222222';
const INTENT_ID = '33333333-3333-3333-3333-333333333333';
const PROVIDER_INTENT_ID = 'mock_test_intent_1';

function baseBooking(
  overrides: Partial<StaysBooking> = {},
): StaysBooking {
  return {
    id: BOOKING_ID,
    listing_id: LISTING_ID,
    guest_user_id: GUEST_A,
    status: 'PAYMENT_PENDING',
    total_paid: 525,
    guest_fee: 25,
    host_fee: 25,
    payout_amount: 475,
    currency: 'MAD',
    checkin_date: new Date('2026-09-01'),
    checkout_date: new Date('2026-09-03'),
    ...overrides,
  } as StaysBooking;
}

function pendingIntent(
  overrides: Partial<StaysPaymentIntent> = {},
): StaysPaymentIntent {
  return {
    id: INTENT_ID,
    booking_id: BOOKING_ID,
    provider: 'mock',
    provider_intent_id: PROVIDER_INTENT_ID,
    amount: 525,
    currency: 'MAD',
    status: 'PENDING',
    idempotency_key: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as StaysPaymentIntent;
}

type ServiceDeps = {
  bookingRepo: { findOne: jest.Mock; update?: jest.Mock };
  intentRepo: { findOne: jest.Mock; create?: jest.Mock; save?: jest.Mock };
  transaction: jest.Mock;
  availability?: { isListingAvailable: jest.Mock };
};

function buildTransactionMock(state: {
  intent: StaysPaymentIntent;
  booking: StaysBooking;
  ledgerSave: jest.Mock;
  ledgerFindOne: jest.Mock;
  intentUpdate: jest.Mock;
  bookingUpdate: jest.Mock;
}) {
  state.bookingUpdate.mockResolvedValue({ affected: 1 });
  return jest.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === StaysPaymentIntent) {
          return {
            createQueryBuilder: () => ({
              setLock: () => ({
                where: () => ({
                  getOne: jest.fn().mockResolvedValue({ ...state.intent }),
                }),
              }),
            }),
            update: state.intentUpdate,
          };
        }
        if (entity === StaysLedgerEntry) {
          return {
            findOne: state.ledgerFindOne,
            save: state.ledgerSave,
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
                      .mockResolvedValue({ ...state.booking, listing: { id: LISTING_ID } }),
                  }),
                }),
              }),
            }),
            update: state.bookingUpdate,
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
}

function createPaymentsService(deps: ServiceDeps): StaysPaymentsService {
  return new StaysPaymentsService(
    { transaction: deps.transaction } as never,
    deps.intentRepo as never,
    { save: jest.fn() } as never,
    deps.bookingRepo as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    deps.availability ?? { isListingAvailable: jest.fn().mockResolvedValue(true) } as never,
    { provisionWithinTransaction: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
  );
}

describe('Mock payment confirm (authenticated)', () => {
  const originalProvider = process.env.STAYS_PAYMENT_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
  });

  afterEach(() => {
    process.env.STAYS_PAYMENT_PROVIDER = originalProvider;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('Test 1 — valid guest payment confirms booking and creates one ledger path', async () => {
    const booking = baseBooking();
    const intent = pendingIntent();
    const ledgerSave = jest.fn().mockResolvedValue(undefined);
    const ledgerFindOne = jest.fn().mockResolvedValue(null);
    const intentUpdate = jest.fn().mockResolvedValue(undefined);
    const bookingUpdate = jest.fn().mockResolvedValue(undefined);

    const bookingRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce({ ...booking, status: 'CONFIRMED' }),
    };
    const intentRepo = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(intent)
        .mockResolvedValueOnce({ ...intent, status: 'SUCCEEDED' }),
    };

    const service = createPaymentsService({
      bookingRepo,
      intentRepo,
      transaction: buildTransactionMock({
        intent,
        booking,
        ledgerSave,
        ledgerFindOne,
        intentUpdate,
        bookingUpdate,
      }),
    });

    const result = await service.confirmMockPayment(BOOKING_ID, GUEST_A);

    expect(result.status).toBe('CONFIRMED');
    expect(result.booking_id).toBe(BOOKING_ID);
    expect(result.amount).toBe(525);
    expect(intentUpdate).toHaveBeenCalledWith(
      { id: INTENT_ID },
      expect.objectContaining({ status: 'SUCCEEDED' }),
    );
    expect(bookingUpdate).toHaveBeenCalledWith(
      { id: BOOKING_ID, status: 'PAYMENT_PENDING' },
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
    expect(ledgerSave).toHaveBeenCalledTimes(1);
    const ledgerEntries = ledgerSave.mock.calls[0][0];
    expect(ledgerEntries.filter((e: { type: string }) => e.type === 'GUEST_PAYMENT')).toHaveLength(1);
  });

  it('Test 2 — guest cannot confirm another guest booking', async () => {
    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest.fn().mockResolvedValue(baseBooking({ guest_user_id: GUEST_B })),
      },
      intentRepo: { findOne: jest.fn() },
      transaction: jest.fn(),
    });

    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Test 4 — missing payment intent returns 404', async () => {
    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest.fn().mockResolvedValue(baseBooking()),
      },
      intentRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      },
      transaction: jest.fn(),
    });

    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Test 5 — expired booking cannot be paid', async () => {
    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest
          .fn()
          .mockImplementation(async () => baseBooking({ status: 'EXPIRED' })),
      },
      intentRepo: { findOne: jest.fn() },
      transaction: jest.fn(),
    });

    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toThrow(/EXPIRED/);
  });

  it('Test 6 — cancelled booking cannot be paid', async () => {
    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest.fn().mockImplementation(async () =>
          baseBooking({ status: 'CANCELLED_BY_GUEST' }),
        ),
      },
      intentRepo: { findOne: jest.fn() },
      transaction: jest.fn(),
    });

    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toThrow(/CANCELLED_BY_GUEST/);
  });

  it('Test 7 — duplicate confirmation is idempotent', async () => {
    const booking = baseBooking({ status: 'CONFIRMED' });
    const intent = pendingIntent({ status: 'SUCCEEDED' });

    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest.fn().mockImplementation(async () => booking),
      },
      intentRepo: {
        findOne: jest.fn().mockImplementation(async () => intent),
      },
      transaction: jest.fn(),
    });

    const result = await service.confirmMockPayment(BOOKING_ID, GUEST_A);

    expect(result.status).toBe('PAYMENT_ALREADY_PROCESSED');
  });

  it('Test 8 — intent amount mismatch rejects confirmation', async () => {
    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest.fn().mockResolvedValue(baseBooking({ total_paid: 525 })),
      },
      intentRepo: {
        findOne: jest.fn().mockResolvedValue(pendingIntent({ amount: 100 })),
      },
      transaction: jest.fn(),
    });

    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.confirmMockPayment(BOOKING_ID, GUEST_A),
    ).rejects.toThrow(/does not match booking total/i);
  });

  it('Test 10 — mock confirm endpoint works when provider=mock (dogfood soft-launch runtime)', async () => {
    // Boot policy separately requires NEXA_ENV=dogfood for NODE_ENV=production+mock.
    process.env.NODE_ENV = 'production';
    process.env.NEXA_ENV = 'dogfood';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    const booking = baseBooking();
    const intent = pendingIntent();

    const service = createPaymentsService({
      bookingRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(booking)
          .mockResolvedValueOnce({ ...booking, status: 'CONFIRMED' }),
      },
      intentRepo: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(intent)
          .mockResolvedValueOnce({ ...intent, status: 'SUCCEEDED' }),
      },
      transaction: buildTransactionMock({
        intent,
        booking,
        ledgerSave: jest.fn().mockResolvedValue(undefined),
        ledgerFindOne: jest.fn().mockResolvedValue(null),
        intentUpdate: jest.fn().mockResolvedValue(undefined),
        bookingUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await service.confirmMockPayment(BOOKING_ID, GUEST_A);
    expect(result.status).toBe('CONFIRMED');
  });
});

describe('Legacy mock webhook gate', () => {
  const originalProvider = process.env.STAYS_PAYMENT_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacy = process.env.ALLOW_LEGACY_MOCK_WEBHOOK;

  afterEach(() => {
    process.env.STAYS_PAYMENT_PROVIDER = originalProvider;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_LEGACY_MOCK_WEBHOOK = originalLegacy;
  });

  it('Test 9 — legacy webhook disabled in production even with mock provider', () => {
    process.env.NODE_ENV = 'production';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    process.env.ALLOW_LEGACY_MOCK_WEBHOOK = 'true';

    expect(isLegacyMockWebhookEnabled()).toBe(false);
  });

  it('Test 9 — legacy webhook disabled by default in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    delete process.env.ALLOW_LEGACY_MOCK_WEBHOOK;

    expect(isLegacyMockWebhookEnabled()).toBe(false);
  });
});

describe('confirmPaymentSuccess idempotency', () => {
  it('second webhook does not duplicate ledger when intent already succeeded', async () => {
    const intentRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: INTENT_ID,
        booking_id: BOOKING_ID,
        status: 'SUCCEEDED',
        provider: 'mock',
        provider_intent_id: PROVIDER_INTENT_ID,
        amount: 525,
      }),
    };

    const transaction = jest.fn(async (cb) =>
      cb({
        getRepository: () => ({
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: jest.fn().mockResolvedValue({
                  id: INTENT_ID,
                  booking_id: BOOKING_ID,
                  status: 'SUCCEEDED',
                  amount: 525,
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

    const outcome = await service.confirmPaymentSuccess('mock', PROVIDER_INTENT_ID);
    expect(outcome).toBe('ALREADY_PROCESSED');
  });
});
