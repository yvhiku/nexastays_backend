import {
  checkConfirmationLedgerInvariant,
} from './financial-observability';

describe('financial observability PROD-OPS-003', () => {
  it('accepts balanced ledger amounts', () => {
    expect(
      checkConfirmationLedgerInvariant({
        guestPayment: 100,
        guestFee: 5,
        hostFee: 5,
        platformFee: 10,
        hostPayout: 90,
      }).ok,
    ).toBe(true);
  });

  it('rejects unbalanced guest payment equation', () => {
    const r = checkConfirmationLedgerInvariant({
      guestPayment: 100,
      guestFee: 5,
      hostFee: 5,
      platformFee: 10,
      hostPayout: 80,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/GUEST_PAYMENT/);
    }
  });
});
