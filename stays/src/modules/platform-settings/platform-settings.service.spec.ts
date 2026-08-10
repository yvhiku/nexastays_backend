import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService — fee cache / authoritative rates', () => {
  function buildService(initial = { guest_fee_pct: 0.05, host_fee_pct: 0.05 }) {
    const state = {
      row: { id: 1, ...initial, updated_by: null as string | null },
    };
    const settingsRepo = {
      findOne: jest.fn(async () => ({ ...state.row })),
      findOneOrFail: jest.fn(async () => ({ ...state.row })),
      save: jest.fn(async (v: typeof state.row) => {
        state.row = { ...state.row, ...v };
        return state.row;
      }),
      update: jest.fn(async (_where: unknown, patch: Partial<typeof state.row>) => {
        state.row = { ...state.row, ...patch };
        return { affected: 1 };
      }),
      create: jest.fn((v: Partial<typeof state.row>) => ({ id: 1, ...v })),
    };

    const service = new PlatformSettingsService(settingsRepo as never);
    return { service, settingsRepo, state };
  }

  it('calculateFeesAuthoritative always loads rates from DB', async () => {
    const { service, settingsRepo, state } = buildService();
    await service.refreshCache();
    settingsRepo.findOneOrFail.mockClear();

    state.row = { ...state.row, guest_fee_pct: 0.1, host_fee_pct: 0.1 };

    const fees = await service.calculateFeesAuthoritative(1000);
    expect(settingsRepo.findOneOrFail).toHaveBeenCalled();
    expect(fees.guestFee).toBe(100);
    expect(fees.hostFee).toBe(100);
    expect(fees.totalPaid).toBe(1100);
    expect(fees.payoutAmount).toBe(900);
  });

  it('fee update does not rewrite a prior in-memory fee snapshot', async () => {
    const { service } = buildService({
      guest_fee_pct: 0.05,
      host_fee_pct: 0.05,
    });
    await service.refreshCache();

    const snapshot = await service.calculateFeesAuthoritative(1000);
    expect(snapshot.totalPaid).toBe(1050);

    await service.updateFeeRates(0.1, 0.1, 'admin-1');
    const later = await service.calculateFeesAuthoritative(1000);
    expect(later.totalPaid).toBe(1100);
    // Booking columns would keep the earlier snapshot; this object is immutable here.
    expect(snapshot.guestFee).toBe(50);
    expect(snapshot.totalPaid).toBe(1050);
  });

  it('updateFeeRates refreshes the local process cache', async () => {
    const { service } = buildService();
    await service.refreshCache();
    expect(service.getFeeRates().guest_fee_pct).toBe(0.05);

    await service.updateFeeRates(0.07, 0.04, 'admin-1');
    expect(service.getFeeRates().guest_fee_pct).toBe(0.07);
    expect(service.getFeeRates().host_fee_pct).toBe(0.04);
  });

  it('calculateFees identity: total_paid = payout + guest + host', async () => {
    const { service } = buildService({
      guest_fee_pct: 0.05,
      host_fee_pct: 0.03,
    });
    const fees = await service.calculateFeesAuthoritative(1000);
    expect(fees.guestFee).toBe(50);
    expect(fees.hostFee).toBe(30);
    expect(fees.totalPaid).toBe(1050);
    expect(fees.payoutAmount).toBe(970);
    expect(fees.totalPaid).toBe(
      fees.payoutAmount + fees.guestFee + fees.hostFee,
    );
  });
});
