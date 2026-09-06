import { StaysPaymentsService } from './stays-payments.service';
import { CmiPaymentProvider } from './cmi-payment.provider';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';

/**
 * Focused lifecycle helpers (Phase 2A): capture / void / refund after ledger work.
 * Mock provider path never invokes these methods.
 */
describe('StaysPaymentsService CMI lifecycle helpers', () => {
  const cmiProvider = {
    capture: jest.fn(),
    voidAuthorization: jest.fn(),
    refund: jest.fn(),
  };

  const intentRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const ledgerRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (row) => row),
  };

  const alerting = { alert: jest.fn().mockResolvedValue(undefined) };

  let service: StaysPaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaysPaymentsService(
      {} as never, // dataSource
      intentRepo as never,
      ledgerRepo as never,
      {} as never, // bookingRepo
      {} as never, // listingRepo
      { log: jest.fn() } as never,
      {} as never, // availabilityService
      { provisionWithinTransaction: jest.fn() } as never,
      cmiProvider as unknown as CmiPaymentProvider,
      alerting as never,
    );
  });

  it('captureCmiAfterConfirm records SUCCEEDED and skips when already captured', async () => {
    const intent = {
      id: 'pi-1',
      booking_id: 'b-1',
      amount: '100.00',
      currency: 'MAD',
      metadata: {},
    } as unknown as StaysPaymentIntent;

    cmiProvider.capture.mockResolvedValue({
      ok: true,
      op: 'PostAuth',
      providerIntentId: 'STAYS-1',
      procReturnCode: '00',
    });

    await service.captureCmiAfterConfirm('STAYS-1', intent);
    expect(cmiProvider.capture).toHaveBeenCalledWith({
      providerIntentId: 'STAYS-1',
      amount: 100,
      currency: 'MAD',
    });
    expect(intentRepo.update).toHaveBeenCalledWith(
      { id: 'pi-1' },
      expect.objectContaining({
        metadata: expect.objectContaining({ cmi_capture_status: 'SUCCEEDED' }),
      }),
    );

    intent.metadata = { cmi_capture_status: 'SUCCEEDED' };
    cmiProvider.capture.mockClear();
    await service.captureCmiAfterConfirm('STAYS-1', intent);
    expect(cmiProvider.capture).not.toHaveBeenCalled();
  });

  it('voidCmiPreAuth records void metadata', async () => {
    cmiProvider.voidAuthorization.mockResolvedValue({
      ok: true,
      op: 'Void',
      providerIntentId: 'STAYS-void',
      procReturnCode: '00',
    });
    intentRepo.findOne.mockResolvedValue({
      id: 'pi-2',
      metadata: {},
    });

    await service.voidCmiPreAuth('STAYS-void', { reason: 'DATES_UNAVAILABLE' });
    expect(cmiProvider.voidAuthorization).toHaveBeenCalledWith({
      providerIntentId: 'STAYS-void',
    });
    expect(intentRepo.update).toHaveBeenCalledWith(
      { id: 'pi-2' },
      expect.objectContaining({
        metadata: expect.objectContaining({
          cmi_void_status: 'SUCCEEDED',
          reason: 'DATES_UNAVAILABLE',
        }),
      }),
    );
  });

  it('refundCmiForBooking settles PENDING REFUND on provider success', async () => {
    intentRepo.findOne.mockResolvedValue({
      id: 'pi-3',
      provider_intent_id: 'STAYS-r',
      amount: '50',
      currency: 'MAD',
      metadata: {},
    });
    const pendingRefund = {
      id: 'led-refund',
      status: 'PENDING',
      amount: 50,
      metadata: {},
    };
    ledgerRepo.findOne.mockResolvedValue(pendingRefund);
    cmiProvider.refund.mockResolvedValue({
      ok: true,
      op: 'Credit',
      providerIntentId: 'STAYS-r',
      procReturnCode: '00',
    });

    const ok = await service.refundCmiForBooking('b-refund', 50, 'MAD');
    expect(ok).toBe(true);
    expect(cmiProvider.refund).toHaveBeenCalled();
    expect(ledgerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'led-refund', status: 'SETTLED' }),
    );
  });
});
