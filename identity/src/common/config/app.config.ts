/** Parse comma-separated list; empty or missing returns [] */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DEV_ONLY_SECRET = 'dev-only-secret-not-for-production';

export const appConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  env: process.env.NODE_ENV || 'development',
  /** Legacy HS256 material — prefer RS256 JWT_PRIVATE_KEY/JWT_PUBLIC_KEY. Never hardcode in prod. */
  get jwtSecret(): string {
    const fromEnv = (process.env.JWT_SECRET ?? '').trim();
    if (fromEnv) return fromEnv;
    if (process.env.NODE_ENV === 'production') {
      // RS256 keys are the production signing path; do not fall back to a shared default.
      return '';
    }
    return DEV_ONLY_SECRET;
  },
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  demoOtpCode: process.env.DEMO_OTP_CODE || '',
  otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),
  dailyTransferLimit: Number(process.env.DAILY_TRANSFER_LIMIT || 10000),
  monthlyTransferLimit: Number(process.env.MONTHLY_TRANSFER_LIMIT || 100000),
  maxSingleTransfer: Number(process.env.MAX_SINGLE_TRANSFER || 5000),
  /** CORS: production set CORS_ORIGINS (e.g. https://nexa.ma,https://admin.nexa.ma). Dev allows localhost. */
  get corsOrigins(): string[] {
    return parseCorsOrigins();
  },
  /** Body limit in bytes (JSON/urlencoded). Default 1MB. */
  bodyLimit: parseInt(process.env.BODY_LIMIT || '1048576', 10),
  /** Stays service base URL for cross-service header aggregation. */
  get staysApiBaseUrl(): string {
    return (process.env.STAYS_API_BASE_URL || 'http://127.0.0.1:3002/api/v1').replace(
      /\/$/,
      '',
    );
  },
  /** Refresh token validity in seconds. Beta: 7 days. */
  refreshTokenExpiresIn: parseInt(
    process.env.REFRESH_TOKEN_EXPIRES_IN || '604800',
    10,
  ),
  /**
   * Pepper for hashing national_id_number (CNIE). Never log.
   * In production, KYC_HASH_PEPPER must be set (otherwise changing JWT_SECRET would change hashes).
   */
  get kycHashPepper(): string {
    if (process.env.NODE_ENV === 'production' && !process.env.KYC_HASH_PEPPER) {
      throw new Error(
        'KYC_HASH_PEPPER is required in production. Set it so CNIE hashes are stable and independent of JWT_SECRET.',
      );
    }
    return (
      process.env.KYC_HASH_PEPPER ||
      process.env.JWT_SECRET ||
      DEV_ONLY_SECRET
    );
  },
  /**
   * Argon2id hash of the admin password (preferred).
   * Generate with: node -e "require('argon2').hash('your-password').then(console.log)"
   */
  get adminPasswordHash(): string {
    return (process.env.ADMIN_PASSWORD_HASH ?? '').trim();
  },
  /**
   * Legacy plaintext admin password — allowed only outside production.
   * Prefer ADMIN_PASSWORD_HASH.
   */
  get adminPassword(): string {
    return (process.env.ADMIN_PASSWORD ?? '').trim();
  },
  /** Pepper for hashing OTP codes / email verification tokens at rest. */
  get otpPepper(): string {
    const pepper =
      process.env.OTP_PEPPER ||
      process.env.REFRESH_TOKEN_PEPPER ||
      process.env.JWT_SECRET ||
      '';
    if (process.env.NODE_ENV === 'production' && !process.env.OTP_PEPPER && !process.env.REFRESH_TOKEN_PEPPER) {
      throw new Error(
        'OTP_PEPPER (or REFRESH_TOKEN_PEPPER) is required in production for hashing one-time codes.',
      );
    }
    return pepper || 'dev-otp-pepper-not-for-production';
  },
  /** Pepper for HMAC of refresh token hashes. Required in production. */
  get refreshTokenPepper(): string {
    const pepper =
      process.env.REFRESH_TOKEN_PEPPER ||
      process.env.JWT_SECRET ||
      '';
    if (process.env.NODE_ENV === 'production' && !process.env.REFRESH_TOKEN_PEPPER) {
      throw new Error(
        'REFRESH_TOKEN_PEPPER is required in production.',
      );
    }
    if (!pepper) {
      return 'dev-refresh-pepper-not-for-production';
    }
    return pepper;
  },
  /** Email verification / password-reset style tokens expire after this many seconds (default 1 hour). */
  emailVerificationExpiresSeconds: parseInt(
    process.env.EMAIL_VERIFICATION_EXPIRES_SECONDS || '3600',
    10,
  ),
  /** Single admin email (legacy). Keep empty unless explicitly configured. */
  adminEmail: process.env.ADMIN_EMAIL || '',
  /**
   * Comma-separated admin allowlist from ADMIN_EMAILS.
   * No built-in defaults for security.
   */
  get adminEmails(): string[] {
    const raw = process.env.ADMIN_EMAILS || '';
    const fromEnv = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(fromEnv)];
  },
  pinMaxAttempts: parseInt(process.env.PIN_MAX_ATTEMPTS || '5', 10),
  pinAttemptWindowMinutes: parseInt(
    process.env.PIN_ATTEMPT_WINDOW_MINUTES || '15',
    10,
  ),
  pinBaseLockoutSeconds: parseInt(
    process.env.PIN_BASE_LOCKOUT_SECONDS || '60',
    10,
  ),
  pinMaxLockoutSeconds: parseInt(
    process.env.PIN_MAX_LOCKOUT_SECONDS || '3600',
    10,
  ),
  /**
   * Payment token (QR / NFC) HMAC: unified secret, or split per channel.
   * Production: set `QR_NFC_HMAC_SECRET`, or both `QR_SIGNING_SECRET` and `NFC_SIGNING_SECRET` (must differ).
   * Never use JWT signing material as the long-term payment MAC in production.
   */
  resolvePaymentHmacSecrets(): { qr: string; nfc: string } {
    const unified = process.env.QR_NFC_HMAC_SECRET?.trim();
    const qrOnly = process.env.QR_SIGNING_SECRET?.trim();
    const nfcOnly = process.env.NFC_SIGNING_SECRET?.trim();
    if (process.env.NODE_ENV === 'production') {
      if (unified && !qrOnly && !nfcOnly) {
        return { qr: unified, nfc: unified };
      }
      if (qrOnly && nfcOnly) {
        if (qrOnly === nfcOnly) {
          throw new Error(
            'QR_SIGNING_SECRET and NFC_SIGNING_SECRET must not match in production — use distinct key material per surface.',
          );
        }
        return { qr: qrOnly, nfc: nfcOnly };
      }
      throw new Error(
        'Production payment signing: set QR_NFC_HMAC_SECRET, or both QR_SIGNING_SECRET and NFC_SIGNING_SECRET.',
      );
    }
    const fallback =
      unified || qrOnly || nfcOnly || process.env.JWT_SECRET || DEV_ONLY_SECRET;
    return { qr: qrOnly || fallback, nfc: nfcOnly || fallback };
  },
  /** @deprecated Prefer resolvePaymentHmacSecrets() or qrSigningSecret / nfcSigningSecret per surface. */
  get qrNfcHmacSecret(): string {
    return this.resolvePaymentHmacSecrets().qr;
  },
  get qrSigningSecret(): string {
    return this.resolvePaymentHmacSecrets().qr;
  },
  get nfcSigningSecret(): string {
    return this.resolvePaymentHmacSecrets().nfc;
  },
  /**
   * IN_FLIGHT idempotency rows older than this may be reclaimed after a crash (minutes).
   * Long-running PSP flows should raise this (or lower after provider callback reliability improves).
   */
  moneyIdempotencyStaleInFlightMinutes: parseInt(
    process.env.MONEY_IDEMPOTENCY_STALE_IN_FLIGHT_MINUTES || '15',
    10,
  ),
  /** Bump when cached `response_json` shape changes so ops can filter replays. */
  moneyIdempotencyResponseContractVersion: parseInt(
    process.env.MONEY_IDEMPOTENCY_RESPONSE_CONTRACT_VERSION || '1',
    10,
  ),
  /**
   * If true, server errors delete the idempotency row (unsafe with external PSPs). Default false.
   */
  get idempotencyDeleteRowOnServerError(): boolean {
    return process.env.IDEMPOTENCY_DELETE_ROW_ON_SERVER_ERROR === 'true';
  },
  /**
   * Basis points (1/100th of a percent) withheld on QR/NFC merchant taps; remainder credits merchant.
   */
  qrMerchantFeeBps: parseInt(process.env.QR_MERCHANT_FEE_BPS || '0', 10),
  /** When false, top-up/withdrawal with a non-mock EMI_PROVIDER_TYPE is refused. */
  get realPaySettlementEnabled(): boolean {
    return process.env.NEXA_ENABLE_REAL_PAY_SETTLEMENT === 'true';
  },
};

/** Nexa Go pricing and settlement config */
export const goConfig = {
  /** UUID of the Nexa Go platform wallet (commission/booking fee). If unset, the FEES system ledger account is used. */
  platformWalletId: process.env.GO_PLATFORM_WALLET_ID?.trim() || null,
  /** Pricing config cache TTL in seconds. Default 300 (5 min). */
  pricingCacheTtlSeconds: parseInt(
    process.env.GO_PRICING_CACHE_TTL_SECONDS || '300',
    10,
  ),
  /** Notify driver when passenger cancels. */
  cancellationNotifyDriverOnPassengerCancel:
    process.env.GO_CANCELLATION_NOTIFY_DRIVER_ON_PASSENGER_CANCEL !== 'false',
  /** Auto-suspend driver after this many cancellations. */
  autoSuspendDriverCancellationThreshold: parseInt(
    process.env.GO_AUTO_SUSPEND_DRIVER_CANCELLATION_THRESHOLD || '5',
    10,
  ),
};

export const sumsubConfig = {
  appToken: process.env.SUMSUB_APP_TOKEN || '',
  secretKey: process.env.SUMSUB_SECRET_KEY || '',
  baseUrl: process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com',
  levelName: process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level',
  tokenTtlSeconds: parseInt(process.env.SUMSUB_TOKEN_TTL_SECONDS || '600', 10),
  webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET || process.env.SUMSUB_SECRET_KEY || '',
};
