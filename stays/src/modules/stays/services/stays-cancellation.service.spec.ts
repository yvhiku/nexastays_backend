import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaysCancellationService } from './stays-cancellation.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysAuditService } from './stays-audit.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { MessagingStateService } from '../../messaging/messaging-state.service';

describe('StaysCancellationService', () => {
  let service: StaysCancellationService;
  let ledgerRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let bookingRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const settledGuestPayment = {
    id: 'ledger-guest-payment',
    booking_id: 'booking-1',
    type: 'GUEST_PAYMENT',
    status: 'SETTLED',
    amount: 1020,
  };

  const mockBooking = (overrides?: Partial<{
    id: string;
    guest_user_id: string;
    status: string;
    checkin_date: string;
    total_subtotal: string;
    guest_fee: string;
    currency: string;
    listing: {
      host_user_id: string;
      rules: { cancellation_policy: 'FLEXIBLE' | 'MODERATE' | 'STRICT' };
    };
  }>) => ({
    id: 'booking-1',
    listing_id: 'listing-1',
    guest_user_id: 'guest-1',
    status: 'CONFIRMED',
    checkin_date: '2026-03-15',
    total_subtotal: '1000',
    guest_fee: '20',
    currency: 'MAD',
    listing: {
      host_user_id: 'host-1',
      rules: { cancellation_policy: 'MODERATE' as const },
    },
    ...overrides,
  });

  function mockLockedBooking(booking: ReturnType<typeof mockBooking>) {
    bookingRepo.createQueryBuilder.mockReturnValue({
      setLock: () => ({
        where: () => ({
          getOne: jest.fn().mockResolvedValue(booking),
        }),
      }),
    });
  }

  /** Paid bookings: first findOne returns settled GUEST_PAYMENT; second returns null (no existing REFUND). */
  function mockPaidLedger() {
    ledgerRepo.findOne
      .mockResolvedValueOnce(settledGuestPayment)
      .mockResolvedValueOnce(null);
  }

  /** Unpaid bookings: no settled GUEST_PAYMENT. */
  function mockUnpaidLedger() {
    ledgerRepo.findOne.mockResolvedValue(null);
  }

  beforeEach(async () => {
    ledgerRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
    };
    bookingRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => {
        const manager = {
          getRepository: jest.fn((entity: unknown) => {
            if (entity === StaysBooking) {
              return {
                ...bookingRepo,
                update: bookingRepo.update,
                createQueryBuilder: bookingRepo.createQueryBuilder,
              };
            }
            if (entity === StaysLedgerEntry) {
              const repo = {
                create: ledgerRepo.create,
                save: ledgerRepo.save,
                findOne: ledgerRepo.findOne,
              };
              ledgerRepo.create.mockImplementation((d: object) => ({ ...d }));
              return repo;
            }
            return {};
          }),
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaysCancellationService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(StaysBooking), useValue: { findOne: bookingRepo.findOne } },
        { provide: getRepositoryToken(StaysLedgerEntry), useValue: {} },
        { provide: getRepositoryToken(StaysListing), useValue: {} },
        {
          provide: StaysAuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: DomainEventsService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MessagingStateService,
          useValue: { syncFromBooking: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<StaysCancellationService>(StaysCancellationService);
  });

  it('should calculate full refund for MODERATE policy when >= 5 days before check-in', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      checkin_date: checkinStr,
      total_subtotal: '1000',
      guest_fee: '20',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
    });

    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(1020);
  });

  it('should calculate 50% refund for MODERATE policy when 1–5 days before check-in', async () => {
    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const checkinStr = twoDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      checkin_date: checkinStr,
      total_subtotal: '1000',
      guest_fee: '20',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
    });

    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(510);
  });

  it('Test 5 — paid booking with zero policy refund creates no REFUND ledger', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const checkinStr = tomorrow.toISOString().split('T')[0];
    const booking = mockBooking({
      checkin_date: checkinStr,
      total_subtotal: '1000',
      guest_fee: '20',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
    });

    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).not.toHaveBeenCalled();
    expect(result.refund_amount).toBe(0);
  });

  it('should calculate full refund for FLEXIBLE policy when >= 24h before check-in', async () => {
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const checkinStr = threeDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      checkin_date: checkinStr,
      total_subtotal: '500',
      guest_fee: '10',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'FLEXIBLE' } },
    });

    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBeGreaterThanOrEqual(500);
  });

  it('should calculate 50% refund for STRICT policy when >= 7 days before check-in', async () => {
    const tenDaysLater = new Date();
    tenDaysLater.setDate(tenDaysLater.getDate() + 10);
    const checkinStr = tenDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      checkin_date: checkinStr,
      total_subtotal: '1000',
      guest_fee: '20',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'STRICT' } },
    });

    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(510);
  });

  it('should reject cancellation of COMPLETED booking', async () => {
    bookingRepo.findOne.mockResolvedValue(mockBooking({ status: 'COMPLETED' }));

    await expect(
      service.cancel('booking-1', 'guest-1', 'guest', undefined, {}),
    ).rejects.toThrow(/Cannot cancel booking in status COMPLETED/);
  });

  it('should reject when non-guest tries to cancel as guest', async () => {
    bookingRepo.findOne.mockResolvedValue(
      mockBooking({ guest_user_id: 'guest-1' }),
    );

    await expect(
      service.cancel('booking-1', 'host-1', 'guest', undefined, {}),
    ).rejects.toThrow(/Only the guest can cancel as guest/);
  });

  it('Test 4 — CONFIRMED + settled GUEST_PAYMENT keeps existing refund policy', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      status: 'CONFIRMED',
      checkin_date: checkinStr,
    });
    bookingRepo.findOne
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ ...booking, status: 'CANCELLED_BY_GUEST' });
    mockLockedBooking(booking);
    mockPaidLedger();

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(result.status).toBe('CANCELLED_BY_GUEST');
    expect(result.refund_amount).toBe(1020);
    expect(ledgerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFUND', amount: 1020 }),
    );
  });

  it('Test 8 — guarded cancel update uses locked status and fails when row no longer matches', async () => {
    const booking = mockBooking({ status: 'CONFIRMED' });
    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    bookingRepo.update.mockResolvedValueOnce({ affected: 0 });

    await expect(
      service.cancel('booking-1', 'guest-1', 'guest', undefined, {}),
    ).rejects.toThrow(/status changed concurrently/i);
  });

  it('Test 1 — PAYMENT_PENDING unpaid cancel creates no REFUND ledger', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      status: 'PAYMENT_PENDING',
      checkin_date: checkinStr,
      total_subtotal: '500',
      guest_fee: '10',
    });
    bookingRepo.findOne
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ ...booking, status: 'CANCELLED_BY_GUEST' });
    mockLockedBooking(booking);
    mockUnpaidLedger();

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(result.status).toBe('CANCELLED_BY_GUEST');
    expect(result.refund_amount).toBe(0);
    expect(ledgerRepo.save).not.toHaveBeenCalled();
  });

  it('Test 2 — INITIATED unpaid cancel creates no REFUND ledger', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      status: 'INITIATED',
      checkin_date: checkinStr,
      total_subtotal: '800',
      guest_fee: '40',
    });
    bookingRepo.findOne
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ ...booking, status: 'CANCELLED_BY_GUEST' });
    mockLockedBooking(booking);
    mockUnpaidLedger();

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(result.status).toBe('CANCELLED_BY_GUEST');
    expect(result.refund_amount).toBe(0);
    expect(ledgerRepo.save).not.toHaveBeenCalled();
  });

  it('Test 3 — positive theoretical refund but no settled payment → no REFUND ledger', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    // CONFIRMED without settled GUEST_PAYMENT (corrupt/incomplete financial state)
    const booking = mockBooking({
      status: 'CONFIRMED',
      checkin_date: checkinStr,
      total_subtotal: '1000',
      guest_fee: '20',
      listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
    });
    bookingRepo.findOne
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ ...booking, status: 'CANCELLED_BY_GUEST' });
    mockLockedBooking(booking);
    mockUnpaidLedger();

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(result.status).toBe('CANCELLED_BY_GUEST');
    expect(result.refund_amount).toBe(0);
    expect(ledgerRepo.save).not.toHaveBeenCalled();
  });

  it('Test 6 — duplicate REFUND prevented when REFUND already exists', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({
      status: 'CONFIRMED',
      checkin_date: checkinStr,
    });
    bookingRepo.findOne
      .mockResolvedValueOnce(booking)
      .mockResolvedValueOnce({ ...booking, status: 'CANCELLED_BY_GUEST' });
    mockLockedBooking(booking);
    ledgerRepo.findOne
      .mockResolvedValueOnce(settledGuestPayment)
      .mockResolvedValueOnce({
        id: 'existing-refund',
        booking_id: 'booking-1',
        type: 'REFUND',
        amount: 1020,
      });

    const result = await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(result.refund_amount).toBe(0);
    expect(ledgerRepo.save).not.toHaveBeenCalled();
  });

  it('Test 7 — positive REFUND path always queries settled GUEST_PAYMENT first', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];
    const booking = mockBooking({ checkin_date: checkinStr });
    bookingRepo.findOne.mockResolvedValue(booking);
    mockLockedBooking(booking);
    mockPaidLedger();

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.findOne).toHaveBeenCalledWith({
      where: {
        booking_id: 'booking-1',
        type: 'GUEST_PAYMENT',
        status: 'SETTLED',
      },
    });
    expect(ledgerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFUND' }),
    );
  });
});
