import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

export interface CmiOrderResult {
  provider: 'cmi';
  provider_intent_id: string;
  redirect_url: string;
  amount: number;
  currency: string;
}

@Injectable()
export class CmiPaymentProvider {
  createOrder(input: {
    bookingId: string;
    amount: number;
    currency: string;
    guestUserId: string;
  }): CmiOrderResult {
    const clientId = process.env.CMI_CLIENT_ID || 'mock-client';
    const storeKey = process.env.CMI_STORE_KEY || 'mock-store-key';
    const baseUrl =
      process.env.CMI_PAYMENT_URL ||
      'https://testpayment.cmi.co.ma/fim/est3Dgate';
    const callbackUrl =
      process.env.CMI_CALLBACK_URL ||
      `${process.env.STAYS_PUBLIC_URL || 'http://127.0.0.1:3002'}/api/v1/stays/webhooks/payments/cmi`;
    const okUrl =
      process.env.CMI_OK_URL ||
      `${process.env.STAYS_WEB_URL || 'http://127.0.0.1:3000'}/bookings`;
    const failUrl =
      process.env.CMI_FAIL_URL ||
      `${process.env.STAYS_WEB_URL || 'http://127.0.0.1:3000'}/bookings`;

    const orderId = `STAYS-${input.bookingId}-${Date.now()}`;
    const amount = input.amount.toFixed(2);
    const rnd = randomBytes(8).toString('hex');

    const hashPlain = [
      clientId,
      orderId,
      amount,
      input.currency,
      okUrl,
      failUrl,
      'PreAuth',
      rnd,
      storeKey,
    ].join('|');

    const hash = createHmac('sha512', storeKey).update(hashPlain).digest('base64');

    const params = new URLSearchParams({
      clientid: clientId,
      oid: orderId,
      amount,
      currency: input.currency,
      okUrl,
      failUrl,
      callbackUrl,
      TranType: 'PreAuth',
      rnd,
      hash,
      email: '',
      BillToName: input.guestUserId,
      lang: 'fr',
    });

    return {
      provider: 'cmi',
      provider_intent_id: orderId,
      redirect_url: `${baseUrl}?${params.toString()}`,
      amount: input.amount,
      currency: input.currency,
    };
  }

  verifyCallback(body: Record<string, unknown>): {
    valid: boolean;
    providerIntentId?: string;
    success: boolean;
  } {
    const storeKey = process.env.CMI_STORE_KEY || 'mock-store-key';
    const oid = String(body.oid ?? body.OID ?? '');
    const amount = String(body.amount ?? body.AMOUNT ?? '');
    const procReturnCode = String(body.ProcReturnCode ?? body.procReturnCode ?? '');
    const hashFromGateway = String(body.HASH ?? body.hash ?? '');

    if (process.env.NODE_ENV !== 'production' && !process.env.CMI_STORE_KEY) {
      return {
        valid: true,
        providerIntentId: oid || undefined,
        success: procReturnCode === '00' || body.status === 'APPROVED',
      };
    }

    const hashPlain = [oid, storeKey, procReturnCode, amount].join('|');
    const expected = createHmac('sha512', storeKey).update(hashPlain).digest('base64');
    const valid = expected === hashFromGateway;
    return {
      valid,
      providerIntentId: oid || undefined,
      success: valid && procReturnCode === '00',
    };
  }
}
