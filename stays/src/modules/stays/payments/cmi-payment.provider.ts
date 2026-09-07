import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import {
  isProductionRuntime,
  requirePublicBaseUrl,
} from '../../../common/security/secrets';

/** Optional Nest token so unit tests can inject a mock fetch without Nest DI. */
export const CMI_FETCH = 'CMI_FETCH';

export interface CmiOrderResult {
  provider: 'cmi';
  provider_intent_id: string;
  redirect_url: string;
  amount: number;
  currency: string;
}

export type CmiMerchantOp = 'PostAuth' | 'Void' | 'Credit';

export interface CmiMerchantResult {
  ok: boolean;
  op: CmiMerchantOp;
  providerIntentId: string;
  procReturnCode: string;
  raw?: string;
  error?: string;
}

function getCmiStoreKey(): string {
  const key = (process.env.CMI_STORE_KEY ?? '').trim();
  if (key) return key;
  if (isProductionRuntime() || process.env.STAYS_PAYMENT_PROVIDER === 'cmi') {
    throw new Error(
      'CMI_STORE_KEY is required when using CMI payments (set via environment variables).',
    );
  }
  return 'mock-store-key';
}

function getCmiClientId(): string {
  const id = (process.env.CMI_CLIENT_ID ?? '').trim();
  if (id) return id;
  if (isProductionRuntime() || process.env.STAYS_PAYMENT_PROVIDER === 'cmi') {
    throw new Error(
      'CMI_CLIENT_ID is required when using CMI payments (set via environment variables).',
    );
  }
  return 'mock-client';
}

/** Server-to-server merchant API (NestPay/CMI-style). Distinct from the 3D gate URL. */
export function getCmiApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.CMI_API_URL ?? '').trim();
  if (configured) return configured.replace(/\/$/, '');
  // Test gate host uses /fim/api for PostAuth/Void/Credit.
  const paymentUrl = (env.CMI_PAYMENT_URL ?? '').trim();
  if (paymentUrl.includes('est3Dgate')) {
    return paymentUrl.replace(/\/fim\/est3Dgate\/?$/i, '/fim/api');
  }
  return 'https://testpayment.cmi.co.ma/fim/api';
}

export type CmiFetch = (input: string, init?: RequestInit) => Promise<Response>;

@Injectable()
export class CmiPaymentProvider {
  private readonly logger = new Logger(CmiPaymentProvider.name);
  private readonly fetchImpl: CmiFetch;

  constructor(@Optional() @Inject(CMI_FETCH) fetchImpl?: CmiFetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  createOrder(input: {
    bookingId: string;
    amount: number;
    currency: string;
    guestUserId: string;
  }): CmiOrderResult {
    const clientId = getCmiClientId();
    const storeKey = getCmiStoreKey();
    const baseUrl =
      process.env.CMI_PAYMENT_URL ||
      'https://testpayment.cmi.co.ma/fim/est3Dgate';
    const callbackUrl =
      process.env.CMI_CALLBACK_URL ||
      `${requirePublicBaseUrl('STAYS_PUBLIC_URL', 'http://127.0.0.1:3002')}/api/v1/stays/webhooks/payments/cmi`;
    const okUrl =
      process.env.CMI_OK_URL ||
      `${requirePublicBaseUrl('STAYS_WEB_URL', 'http://127.0.0.1:3000')}/bookings`;
    const failUrl =
      process.env.CMI_FAIL_URL ||
      `${requirePublicBaseUrl('STAYS_WEB_URL', 'http://127.0.0.1:3000')}/bookings`;

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

    const hash = createHmac('sha512', storeKey)
      .update(hashPlain)
      .digest('base64');

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
    // Always verify HMAC — never accept unsigned callbacks (fail closed).
    const storeKey = getCmiStoreKey();
    const oid = String(body.oid ?? body.OID ?? '');
    const amount = String(body.amount ?? '');
    const procReturnCode = String(
      body.ProcReturnCode ?? body.procReturnCode ?? '',
    );
    const hashFromGateway = String(body.HASH ?? body.hash ?? '');

    if (!hashFromGateway || !oid) {
      return {
        valid: false,
        providerIntentId: oid || undefined,
        success: false,
      };
    }

    const hashPlain = [oid, storeKey, procReturnCode, amount].join('|');
    const expected = createHmac('sha512', storeKey)
      .update(hashPlain)
      .digest('base64');
    const valid = expected === hashFromGateway;
    return {
      valid,
      providerIntentId: oid || undefined,
      success: valid && procReturnCode === '00',
    };
  }

  /** Capture a successful PreAuth (PostAuth). */
  async capture(input: {
    providerIntentId: string;
    amount: number;
    currency: string;
  }): Promise<CmiMerchantResult> {
    return this.merchantRequest('PostAuth', input);
  }

  /** Release an unpaid PreAuth hold. */
  async voidAuthorization(input: {
    providerIntentId: string;
  }): Promise<CmiMerchantResult> {
    return this.merchantRequest('Void', {
      providerIntentId: input.providerIntentId,
      amount: 0,
      currency: 'MAD',
      omitAmount: true,
    });
  }

  /** Credit/refund after capture. */
  async refund(input: {
    providerIntentId: string;
    amount: number;
    currency: string;
  }): Promise<CmiMerchantResult> {
    return this.merchantRequest('Credit', input);
  }

  /**
   * NestPay/CMI merchant API: form POST with HASH.
   * Hash material: ClientId|OrderId|Amount|Currency|storeKey (Amount empty for Void).
   */
  async merchantRequest(
    op: CmiMerchantOp,
    input: {
      providerIntentId: string;
      amount: number;
      currency: string;
      omitAmount?: boolean;
    },
  ): Promise<CmiMerchantResult> {
    const clientId = getCmiClientId();
    const storeKey = getCmiStoreKey();
    const amount = input.omitAmount ? '' : Number(input.amount).toFixed(2);
    const currency = input.omitAmount ? '' : input.currency;
    const hashPlain = [
      clientId,
      input.providerIntentId,
      amount,
      currency,
      storeKey,
    ].join('|');
    const hash = createHmac('sha512', storeKey)
      .update(hashPlain)
      .digest('base64');

    const body = new URLSearchParams({
      CLIENTID: clientId,
      ORDERID: input.providerIntentId,
      NAME: op,
      TYPE: op,
      HASH: hash,
    });
    if (!input.omitAmount) {
      body.set('AMOUNT', amount);
      body.set('currency', currency);
    }

    const apiUrl = getCmiApiUrl();
    try {
      const res = await this.fetchImpl(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const raw = await res.text();
      const procReturnCode = parseProcReturnCode(raw);
      const ok = res.ok && procReturnCode === '00';
      if (!ok) {
        this.logger.warn(
          `CMI ${op} failed for ${input.providerIntentId}: HTTP ${res.status} code=${procReturnCode}`,
        );
      }
      return {
        ok,
        op,
        providerIntentId: input.providerIntentId,
        procReturnCode,
        raw: raw.slice(0, 2000),
        error: ok ? undefined : `CMI_${op}_FAILED`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`CMI ${op} network error: ${message}`);
      return {
        ok: false,
        op,
        providerIntentId: input.providerIntentId,
        procReturnCode: '',
        error: message,
      };
    }
  }
}

function parseProcReturnCode(raw: string): string {
  const xml = /<ProcReturnCode>([^<]*)<\/ProcReturnCode>/i.exec(raw);
  if (xml?.[1]) return xml[1].trim();
  const form = /(?:^|[&\n])ProcReturnCode=([^&\n\r]*)/i.exec(raw);
  if (form?.[1]) return decodeURIComponent(form[1].trim());
  try {
    const json = JSON.parse(raw) as {
      ProcReturnCode?: string;
      procReturnCode?: string;
    };
    return String(json.ProcReturnCode ?? json.procReturnCode ?? '').trim();
  } catch {
    return '';
  }
}
