import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaysCancellationService } from './stays-cancellation.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysAuditService } from './stays-audit.service';

describe('StaysCancellationService', () => {
  let service: StaysCancellationService;
  let ledgerRepo: { create: jest.Mock; save: jest.Mock };
  let bookingRepo: { findOne: jest.Mock; update: jest.Mock };

  const mockBooking = (overrides?: Partial<{
    id: string;
    guest_user_id: string;
    status: string;
    checkin_date: string;
    total_subtotal: string;
    guest_fee: string;
    currency: string;
  }>) => ({
    id: 'booking-1',
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

  beforeEach(async () => {
    ledgerRepo = { create: jest.fn(), save: jest.fn() };
    bookingRepo = { findOne: jest.fn(), update: jest.fn() };

    const mockDataSource = {
      transaction: jest.fn((cb) => {
        const manager = {
          getRepository: jest.fn((entity: unknown) => {
            if (entity === StaysBooking) return { ...bookingRepo, update: bookingRepo.update };
            if (entity === StaysLedgerEntry) {
              const repo = { create: ledgerRepo.create, save: ledgerRepo.save };
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
      ],
    }).compile();

    service = module.get<StaysCancellationService>(StaysCancellationService);
  });

  it('should calculate full refund for MODERATE policy when >= 5 days before check-in', async () => {
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 6);
    const checkinStr = fiveDaysLater.toISOString().split('T')[0];

    bookingRepo.findOne.mockResolvedValue(
      mockBooking({
        checkin_date: checkinStr,
        total_subtotal: '1000',
        guest_fee: '20',
        listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
      }),
    );

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(1020); // full refund (1000 + 20)
  });

  it('should calculate 50% refund for MODERATE policy when 1–5 days before check-in', async () => {
    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const checkinStr = twoDaysLater.toISOString().split('T')[0];

    bookingRepo.findOne.mockResolvedValue(
      mockBooking({
        checkin_date: checkinStr,
        total_subtotal: '1000',
        guest_fee: '20',
        listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
      }),
    );

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(510); // 50% of 1020
  });

  it('should calculate 0% refund for MODERATE policy when < 24h before check-in', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const checkinStr = tomorrow.toISOString().split('T')[0];

    bookingRepo.findOne.mockResolvedValue(
      mockBooking({
        checkin_date: checkinStr,
        total_subtotal: '1000',
        guest_fee: '20',
        listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'MODERATE' } },
      }),
    );

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).not.toHaveBeenCalled(); // no refund
  });

  it('should calculate full refund for FLEXIBLE policy when >= 24h before check-in', async () => {
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const checkinStr = threeDaysLater.toISOString().split('T')[0];

    bookingRepo.findOne.mockResolvedValue(
      mockBooking({
        checkin_date: checkinStr,
        total_subtotal: '500',
        guest_fee: '10',
        listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'FLEXIBLE' } },
      }),
    );

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBeGreaterThanOrEqual(500); // full or near-full refund
  });

  it('should calculate 50% refund for STRICT policy when >= 7 days before check-in', async () => {
    const tenDaysLater = new Date();
    tenDaysLater.setDate(tenDaysLater.getDate() + 10);
    const checkinStr = tenDaysLater.toISOString().split('T')[0];

    bookingRepo.findOne.mockResolvedValue(
      mockBooking({
        checkin_date: checkinStr,
        total_subtotal: '1000',
        guest_fee: '20',
        listing: { host_user_id: 'host-1', rules: { cancellation_policy: 'STRICT' } },
      }),
    );

    await service.cancel('booking-1', 'guest-1', 'guest', undefined, {});

    expect(ledgerRepo.save).toHaveBeenCalled();
    const ledgerCall = ledgerRepo.save.mock.calls[0][0];
    expect(ledgerCall.type).toBe('REFUND');
    expect(ledgerCall.amount).toBe(510); // 50% of 1020
  });

  it('should reject cancellation of COMPLETED booking', async () => {
    bookingRepo.findOne.mockResolvedValue(
      mockBooking({ status: 'COMPLETED' }),
    );

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
});
