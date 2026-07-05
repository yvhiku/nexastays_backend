import { BadRequestException } from '@nestjs/common';
import { FareCalculatorService } from './fare-calculator.service';

describe('FareCalculatorService', () => {
  let service: FareCalculatorService;

  beforeEach(() => {
    service = new FareCalculatorService();
  });

  describe('calculate', () => {
    it('economy short trip under minimum fare', () => {
      const r = service.calculate({
        rideType: 'economy',
        distanceKm: 1,
        durationMin: 3,
      });
      expect(r.riderPayable).toBe(10); // minimum
      expect(r.bookingFee).toBe(1);
      expect(r.fixedCommission).toBe(2);
      expect(r.driverPayout).toBe(8);
      expect(r.platformRevenue).toBe(3); // fixedCommission + bookingFee
    });

    it('economy medium trip', () => {
      const r = service.calculate({
        rideType: 'economy',
        distanceKm: 4.5,
        durationMin: 14,
      });
      expect(r.distanceCharge).toBeCloseTo(9);
      expect(r.timeCharge).toBeCloseTo(2.8);
      expect(r.transportSubtotal).toBeCloseTo(15.8);
      expect(r.grossFareBeforeMin).toBeCloseTo(16.8);
      expect(r.finalFareBeforeDiscount).toBe(17);
      expect(r.riderPayable).toBe(17);
      expect(r.driverPayout).toBe(15);
      expect(r.platformRevenue).toBe(3); // fixedCommission + bookingFee
    });

    it('comfort long trip', () => {
      const r = service.calculate({
        rideType: 'comfort',
        distanceKm: 15,
        durationMin: 30,
      });
      expect(r.baseFare).toBe(6);
      expect(r.distanceCharge).toBe(37.5);
      expect(r.timeCharge).toBeCloseTo(7.5);
      expect(r.riderPayable).toBeGreaterThanOrEqual(50);
      expect(r.driverPayout).toBe(r.riderPayable - 4);
      expect(r.platformRevenue).toBe(6); // fixedCommission + bookingFee
    });

    it('moto short trip', () => {
      const r = service.calculate({
        rideType: 'moto',
        distanceKm: 0.5,
        durationMin: 5,
      });
      expect(r.riderPayable).toBe(8); // minimum
      expect(r.bookingFee).toBe(1);
      expect(r.fixedCommission).toBe(1.5);
      expect(r.driverPayout).toBe(6.5);
    });

    it('promo discount reduces rider payable only', () => {
      const r = service.calculate({
        rideType: 'economy',
        distanceKm: 4.5,
        durationMin: 14,
        promoDiscount: 5,
      });
      expect(r.finalFareBeforeDiscount).toBe(17);
      expect(r.riderPayable).toBe(12);
      expect(r.driverPayout).toBe(15); // unchanged
      expect(r.platformRevenue).toBe(3); // fixedCommission + bookingFee
    });

    it('surge multiplier', () => {
      const r = service.calculate({
        rideType: 'economy',
        distanceKm: 4,
        durationMin: 12,
        surgeMultiplier: 1.2,
      });
      expect(r.surgeMultiplier).toBe(1.2);
      expect(r.surgedTransport).toBeGreaterThan(r.transportSubtotal);
    });

    it('invalid ride type throws', () => {
      expect(() =>
        service.calculate({
          rideType: 'invalid',
          distanceKm: 1,
          durationMin: 5,
        }),
      ).toThrow(BadRequestException);
    });

    it('negative distance throws', () => {
      expect(() =>
        service.calculate({
          rideType: 'economy',
          distanceKm: -1,
          durationMin: 5,
        }),
      ).toThrow(BadRequestException);
    });

    it('negative duration throws', () => {
      expect(() =>
        service.calculate({
          rideType: 'economy',
          distanceKm: 1,
          durationMin: -5,
        }),
      ).toThrow(BadRequestException);
    });

    it('rounds final fare to whole MAD', () => {
      const r = service.calculate({
        rideType: 'economy',
        distanceKm: 3.3,
        durationMin: 10,
      });
      expect(Number.isInteger(r.riderPayable)).toBe(true);
    });
  });
});
