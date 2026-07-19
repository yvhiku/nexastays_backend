import { createHmac } from 'crypto';
import { CmiPaymentProvider } from './cmi-payment.provider';

describe('CmiPaymentProvider.verifyCallback', () => {
  const provider = new CmiPaymentProvider();
  const storeKey = 'test-store-key';

  beforeEach(() => {
    process.env.CMI_STORE_KEY = storeKey;
    process.env.STAYS_PAYMENT_PROVIDER = 'cmi';
  });

  afterEach(() => {
    delete process.env.CMI_STORE_KEY;
    delete process.env.STAYS_PAYMENT_PROVIDER;
  });

  it('rejects missing hash (fail closed)', () => {
    const result = provider.verifyCallback({
      oid: 'STAYS-1',
      amount: '100.00',
      ProcReturnCode: '00',
    });
    expect(result.valid).toBe(false);
    expect(result.success).toBe(false);
  });

  it('rejects tampered amount', () => {
    const oid = 'STAYS-booking-1';
    const amount = '100.00';
    const procReturnCode = '00';
    const hash = createHmac('sha512', storeKey)
      .update([oid, storeKey, procReturnCode, amount].join('|'))
      .digest('base64');
    const result = provider.verifyCallback({
      oid,
      amount: '1.00',
      ProcReturnCode: procReturnCode,
      HASH: hash,
    });
    expect(result.valid).toBe(false);
    expect(result.success).toBe(false);
  });

  it('accepts valid HMAC success', () => {
    const oid = 'STAYS-booking-1';
    const amount = '250.50';
    const procReturnCode = '00';
    const hash = createHmac('sha512', storeKey)
      .update([oid, storeKey, procReturnCode, amount].join('|'))
      .digest('base64');
    const result = provider.verifyCallback({
      oid,
      amount,
      ProcReturnCode: procReturnCode,
      HASH: hash,
    });
    expect(result.valid).toBe(true);
    expect(result.success).toBe(true);
    expect(result.providerIntentId).toBe(oid);
  });
});
