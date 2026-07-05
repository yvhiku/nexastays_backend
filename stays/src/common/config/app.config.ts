export const appConfig = {
  port: parseInt(process.env.PORT || '3002', 10),
  env: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  bodyLimit: parseInt(process.env.BODY_LIMIT || '1048576', 10),
  moneyIdempotencyStaleInFlightMinutes: 15,
  moneyIdempotencyResponseContractVersion: 1,
  get idempotencyDeleteRowOnServerError(): boolean {
    return process.env.IDEMPOTENCY_DELETE_ROW_ON_SERVER_ERROR === 'true';
  },
  get corsOrigins(): string[] {
    const raw = process.env.CORS_ORIGINS || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  },
};
