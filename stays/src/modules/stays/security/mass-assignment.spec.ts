import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateHostListingDto } from '../dto/update-host-listing.dto';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { CreateHostListingDto } from '../dto/create-host-listing.dto';

describe('mass assignment / financial DTO guards', () => {
  it('rejects privilege fields on UpdateHostListingDto (forbidNonWhitelisted)', async () => {
    const dto = plainToInstance(UpdateHostListingDto, {
      title: 'Nice riad',
      host_user_id: 'attacker-uuid',
      host_id: 'attacker-uuid',
      status: 'LIVE',
      is_verified: true,
      commission: 0,
      role: 'ADMIN',
      account_type: 'ADMIN',
      payout_amount: 0,
      rate_plan: { base_price: 350, currency: 'MAD' },
    });
    const forbidErrors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(forbidErrors.length).toBeGreaterThan(0);
    // Nest ValidationPipe whitelist strip (same option without forbid)
    await validate(dto, { whitelist: true });
    expect((dto as unknown as { host_user_id?: string }).host_user_id).toBeUndefined();
    expect((dto as unknown as { status?: string }).status).toBeUndefined();
    expect(dto.title).toBe('Nice riad');
  });

  it('rejects zero base_price on create listing rate plan', async () => {
    const dto = plainToInstance(CreateHostListingDto, {
      title: 'Zero price',
      listing_type: 'APARTMENT',
      city: 'Marrakech',
      rate_plan: { base_price: 0, currency: 'MAD' },
    });
    const errors = await validate(dto, { whitelist: true });
    const flat = JSON.stringify(errors);
    expect(flat).toMatch(/base_price|min/i);
  });

  it('rejects negative guest_count on booking', async () => {
    const dto = plainToInstance(CreateBookingDto, {
      listing_id: '11111111-1111-4111-8111-111111111111',
      checkin_date: '2026-08-01',
      checkout_date: '2026-08-05',
      guest_count: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'guest_count')).toBe(true);
  });

  it('rejects client total_paid / commission on CreateBookingDto', async () => {
    const dto = plainToInstance(CreateBookingDto, {
      listing_id: '11111111-1111-4111-8111-111111111111',
      checkin_date: '2026-08-01',
      checkout_date: '2026-08-05',
      guest_count: 2,
      total_paid: 1,
      commission: 0,
      currency: 'USD',
    });
    const forbidErrors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(forbidErrors.length).toBeGreaterThan(0);
    await validate(dto, { whitelist: true });
    expect((dto as unknown as { total_paid?: number }).total_paid).toBeUndefined();
  });
});
