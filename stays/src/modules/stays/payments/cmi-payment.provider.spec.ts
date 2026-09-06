import { createHmac } from 'crypto';
import {
  CmiPaymentProvider,
  getCmiApiUrl,
} from './cmi-payment.provider';

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

describe('CmiPaymentProvider merchant ops (capture/void/refund)', () => {
  const storeKey = 'test-store-key';
  const clientId = 'test-client';

  beforeEach(() => {
    process.env.CMI_STORE_KEY = storeKey;
    process.env.CMI_CLIENT_ID = clientId;
    process.env.STAYS_PAYMENT_PROVIDER = 'cmi';
    process.env.CMI_API_URL = 'https://cmi.test/fim/api';
  });

  afterEach(() => {
    delete process.env.CMI_STORE_KEY;
    delete process.env.CMI_CLIENT_ID;
    delete process.env.STAYS_PAYMENT_PROVIDER;
    delete process.env.CMI_API_URL;
    delete process.env.CMI_PAYMENT_URL;
  });

  it('getCmiApiUrl derives /fim/api from est3Dgate payment URL', () => {
    delete process.env.CMI_API_URL;
    process.env.CMI_PAYMENT_URL =
      'https://testpayment.cmi.co.ma/fim/est3Dgate';
    expect(getCmiApiUrl()).toBe('https://testpayment.cmi.co.ma/fim/api');
  });

  it('capture posts PostAuth and parses ProcReturnCode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<ProcReturnCode>00</ProcReturnCode>',
    });
    const provider = new CmiPaymentProvider(fetchMock);
    const result = await provider.capture({
      providerIntentId: 'STAYS-1',
      amount: 100.5,
      currency: 'MAD',
    });
    expect(result.ok).toBe(true);
    expect(result.op).toBe('PostAuth');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cmi.test/fim/api',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('NAME=PostAuth');
    expect(body).toContain('ORDERID=STAYS-1');
    expect(body).toContain('AMOUNT=100.50');
  });

  it('voidAuthorization omits amount and uses Void', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ProcReturnCode=00',
    });
    const provider = new CmiPaymentProvider(fetchMock);
    const result = await provider.voidAuthorization({
      providerIntentId: 'STAYS-void-1',
    });
    expect(result.ok).toBe(true);
    expect(result.op).toBe('Void');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('NAME=Void');
    expect(body).not.toContain('AMOUNT=');
  });

  it('refund uses Credit and fails closed on non-00', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<ProcReturnCode>99</ProcReturnCode>',
    });
    const provider = new CmiPaymentProvider(fetchMock);
    const result = await provider.refund({
      providerIntentId: 'STAYS-r-1',
      amount: 50,
      currency: 'MAD',
    });
    expect(result.ok).toBe(false);
    expect(result.op).toBe('Credit');
    expect(result.procReturnCode).toBe('99');
  });
});
