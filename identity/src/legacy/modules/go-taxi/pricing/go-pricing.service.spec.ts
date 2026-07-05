import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { GoPricingService } from './go-pricing.service';
import { GoPricingConfig } from './entities/go-pricing-config.entity';

/**
 * Seeded values must match 034_go_pricing_config.sql.
 * economy: base 4, per_km 2, per_min 0.20, min 10, booking 2, commission 10%, commission_min 2.50
 */
const SEEDED_ECONOMY = {
  id: '00000000-0000-0000-0000-000000000001',
  vehicle_type: 'economy',
  base_fare: 4.0,
  per_km_rate: 2.0,
  per_min_rate: 0.2,
  min_fare: 10.0,
  booking_fee: 2.0,
  commission_type: 'percentage',
  commission_rate: 0.1,
  commission_min: 2.5,
  cancellation_window_secs: 120,
  cancellation_fee: 2.0,
  surge_multiplier: 1.0,
  surge_active: false,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

function mockConfigRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(SEEDED_ECONOMY),
  };
}

function mockCache() {
  return {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

describe('GoPricingService', () => {
  let service: GoPricingService;
  let configRepo: ReturnType<typeof mockConfigRepo>;

  beforeEach(async () => {
    configRepo = mockConfigRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoPricingService,
        {
          provide: getRepositoryToken(GoPricingConfig),
          useValue: configRepo,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache(),
        },
      ],
    }).compile();

    service = module.get<GoPricingService>(GoPricingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateFare (economy seed)', () => {
    it('applies minimum fare when raw fare is below threshold', async () => {
      const out = await service.estimateFare('economy', 0.5, 2);
      expect(out.fare).toBe(10);
      expect(out.breakdown.minFareApplied).toBe(true);
      expect(out.breakdown.baseFare).toBe(4);
      expect(out.breakdown.distanceComponent).toBe(1);
      expect(out.breakdown.timeComponent).toBe(0.4);
    });

    it('applies commission floor when 10% of fare is below minimum', async () => {
      const out = await service.estimateFare('economy', 1, 5);
      const rawFare = 4 + 2 + 1;
      expect(rawFare).toBe(7);
      expect(out.fare).toBe(10);
      const rawCommission = 10 * 0.1;
      expect(rawCommission).toBe(1);
      expect(out.commission).toBe(2.5);
      expect(out.driverPayout).toBe(7.5);
    });

    it('booking fee is collected independently of fare', async () => {
      const out = await service.estimateFare('economy', 2, 10);
      expect(out.bookingFee).toBe(2);
      expect(out.passengerTotal).toBe(out.fare + 2);
      expect(out.platformTake).toBe(2 + out.commission);
    });

    it('trip completion uses actual distance and duration not estimate', async () => {
      const estimate = await service.estimateFare('economy', 5, 15);
      const finalFare = await service.getFinalFare('economy', 5.5, 18);
      expect(finalFare.fare).not.toBe(estimate.fare);
      expect(finalFare.breakdown.distanceComponent).toBe(11);
      expect(finalFare.breakdown.timeComponent).toBe(3.6);
    });

    it('driver payout is fare minus commission only', async () => {
      const out = await service.estimateFare('economy', 3, 10);
      expect(out.driverPayout).toBe(out.fare - out.commission);
    });

    it('platform take is booking fee plus commission', async () => {
      const out = await service.estimateFare('economy', 3, 10);
      expect(out.platformTake).toBe(out.bookingFee + out.commission);
    });
  });

  describe('surge', () => {
    it('surge multiplier is applied to fare but not to booking fee when surge_active', async () => {
      configRepo.findOne.mockResolvedValueOnce({
        ...SEEDED_ECONOMY,
        surge_multiplier: 1.5,
        surge_active: true,
      });
      const out = await service.estimateFare('economy', 2, 10);
      const baseFareNoSurge = 4 + 4 + 2;
      expect(baseFareNoSurge).toBe(10);
      expect(out.surgeActive).toBe(true);
      expect(out.surgeMultiplier).toBe(1.5);
      expect(out.fare).toBe(15);
      expect(out.bookingFee).toBe(2);
      expect(out.passengerTotal).toBe(17);
    });
  });
});
