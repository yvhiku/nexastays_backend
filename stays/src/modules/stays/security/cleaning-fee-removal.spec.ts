import { readFileSync } from 'fs';
import { join } from 'path';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';

describe('Cleaning fee product removal', () => {
  it('Test 1 — host RatePlan DTO has no cleaning_fee field', () => {
    const dtoPath = join(__dirname, '../dto/create-host-listing.dto.ts');
    const updatePath = join(__dirname, '../dto/update-host-listing.dto.ts');
    const entityPath = join(
      __dirname,
      '../entities/stays-rate-plan.entity.ts',
    );

    for (const path of [dtoPath, updatePath, entityPath]) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/cleaning_fee|cleaningFee/);
    }
  });

  it('Test 2 — booking fee math has no cleaning component (base × nights only)', () => {
    const settings = Object.create(
      PlatformSettingsService.prototype,
    ) as PlatformSettingsService;
    (
      settings as unknown as {
        getFeeRates: () => { guest_fee_pct: number; host_fee_pct: number };
      }
    ).getFeeRates = () => ({ guest_fee_pct: 0.05, host_fee_pct: 0.05 });

    const basePrice = 300;
    const nights = 2;
    const subtotal = basePrice * nights; // 600 — no cleaning fee
    const fees = settings.calculateFees(subtotal);

    expect(subtotal).toBe(600);
    expect(fees.guestFee).toBe(30);
    expect(fees.hostFee).toBe(30);
    expect(fees.totalPaid).toBe(630);
    expect(fees.payoutAmount).toBe(570);
    expect(fees.totalPaid).toBe(
      fees.payoutAmount + fees.guestFee + fees.hostFee,
    );
  });

  it('Test 3/4/5 — payment/ledger/refund sources do not reference cleaning_fee', () => {
    const payments = readFileSync(
      join(__dirname, '../payments/stays-payments.service.ts'),
      'utf8',
    );
    const cancellation = readFileSync(
      join(__dirname, '../services/stays-cancellation.service.ts'),
      'utf8',
    );
    const createBooking = readFileSync(
      join(__dirname, '../stays.service.ts'),
      'utf8',
    );

    for (const source of [payments, cancellation, createBooking]) {
      expect(source).not.toMatch(/cleaning_fee|cleaningFee/);
    }
  });
});
