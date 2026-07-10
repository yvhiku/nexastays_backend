import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaysAvailabilityService } from './stays-availability.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysAvailabilityBlock } from '../entities/stays-availability-block.entity';

describe('StaysAvailabilityService', () => {
  let service: StaysAvailabilityService;
  let bookingRepo: { createQueryBuilder: jest.Mock };
  let availabilityRepo: { createQueryBuilder: jest.Mock };

  const mockQueryBuilder = (rawResult: { listing_id: string }[], count = 0) => {
    return {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawResult),
      getCount: jest.fn().mockResolvedValue(count),
      getMany: jest.fn().mockResolvedValue([]),
    };
  };

  beforeEach(async () => {
    bookingRepo = { createQueryBuilder: jest.fn() };
    availabilityRepo = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaysAvailabilityService,
        { provide: getRepositoryToken(StaysBooking), useValue: bookingRepo },
        { provide: getRepositoryToken(StaysAvailabilityBlock), useValue: availabilityRepo },
      ],
    }).compile();

    service = module.get<StaysAvailabilityService>(StaysAvailabilityService);
  });

  it('should return listing IDs with overlapping CONFIRMED bookings', async () => {
    bookingRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([{ listing_id: 'listing-1' }, { listing_id: 'listing-2' }]),
    );
    availabilityRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([]),
    );

    const unavailable = await service.getUnavailableListingIds(
      '2026-03-10',
      '2026-03-15',
    );

    expect(unavailable).toContain('listing-1');
    expect(unavailable).toContain('listing-2');
    expect(bookingRepo.createQueryBuilder).toHaveBeenCalledWith('b');
  });

  it('should return listing IDs with blocked dates in availability_blocks', async () => {
    bookingRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([]),
    );
    availabilityRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([{ listing_id: 'listing-blocked' }]),
    );

    const unavailable = await service.getUnavailableListingIds(
      '2026-03-10',
      '2026-03-15',
    );

    expect(unavailable).toContain('listing-blocked');
  });

  it('should merge unavailable IDs from both bookings and blocks', async () => {
    bookingRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([{ listing_id: 'from-booking' }]),
    );
    availabilityRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([{ listing_id: 'from-block' }]),
    );

    const unavailable = await service.getUnavailableListingIds(
      '2026-03-10',
      '2026-03-15',
    );

    expect(unavailable).toContain('from-booking');
    expect(unavailable).toContain('from-block');
    expect(unavailable).toHaveLength(2);
  });

  it('should filter by listingIds when provided', async () => {
    const qb = mockQueryBuilder([]);
    bookingRepo.createQueryBuilder.mockReturnValue(qb);
    availabilityRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));

    await service.getUnavailableListingIds(
      '2026-03-10',
      '2026-03-15',
      ['listing-a', 'listing-b'],
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'b.listing_id IN (:...listingIds)',
      expect.objectContaining({ listingIds: ['listing-a', 'listing-b'] }),
    );
  });

  it('should return true from isListingAvailable when listing is not unavailable', async () => {
    bookingRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([], 0),
    );
    availabilityRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([], 0),
    );

    const available = await service.isListingAvailable(
      'listing-ok',
      '2026-03-10',
      '2026-03-15',
    );

    expect(available).toBe(true);
  });

  it('should return false from isListingAvailable when listing has overlapping booking', async () => {
    bookingRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([], 1),
    );
    availabilityRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder([], 0),
    );

    const available = await service.isListingAvailable(
      'listing-ok',
      '2026-03-10',
      '2026-03-15',
    );

    expect(available).toBe(false);
  });

  it('formats Date values without UTC day shift', () => {
    const local = new Date(2026, 6, 10); // July 10 local
    expect(service.toDateString(local)).toBe('2026-07-10');
    expect(service.toDateString('2026-07-10T00:00:00.000Z')).toBe('2026-07-10');
  });
});
