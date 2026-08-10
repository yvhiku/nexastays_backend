import {
  assertProductionAlertingConfigured,
  assertProductionMonitoringConfigured,
  DedupingAlertingService,
  ConsoleAlertingService,
  createErrorMonitoring,
  isValidRequestId,
  resolveRequestId,
  sanitizeForTelemetry,
  assertPayloadHasNoSecrets,
  ALERT_SEVERITY_POLICY,
  ObsEvents,
  installFatalHandlers,
  NoopErrorMonitoring,
} from '@nexa/telemetry';

describe('PROD-OPS-003 observability primitives', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('validates and resolves request ids', () => {
    expect(isValidRequestId('short')).toBe(false);
    expect(isValidRequestId('a'.repeat(200))).toBe(false);
    expect(isValidRequestId('req-abc_123.OK')).toBe(true);
    expect(
      resolveRequestId({ 'x-request-id': 'bad' }, () => 'generated-id-01'),
    ).toBe('generated-id-01');
    expect(
      resolveRequestId({ 'x-request-id': 'valid-request-id-1' }, () => 'x'),
    ).toBe('valid-request-id-1');
  });

  it('redacts secrets and OTP-like fields', () => {
    const sanitized = sanitizeForTelemetry({
      otp: '123456',
      authorization: 'Bearer aaa.bbb.ccc',
      password: 'secret',
      phone: '+212612345678',
      safe: 'ok',
    }) as Record<string, unknown>;
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.phone).toBe('[REDACTED]');
    expect(sanitized.safe).toBe('ok');
  });

  it('assertPayloadHasNoSecrets rejects JWT-like and DB URLs', () => {
    expect(() =>
      assertPayloadHasNoSecrets({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
      }),
    ).toThrow(/JWT/);
    expect(() =>
      assertPayloadHasNoSecrets({
        url: 'postgresql://user:pass@localhost:5432/db',
      }),
    ).toThrow(/database/);
  });

  it('production monitoring/alerting fail closed; dev does not', () => {
    process.env.NEXA_ENV = 'production';
    delete process.env.ERROR_MONITORING_DSN;
    expect(() => assertProductionMonitoringConfigured()).toThrow(
      /ERROR_MONITORING_DSN/,
    );
    delete process.env.OPS_ALERT_WEBHOOK_URL;
    delete process.env.PAYMENT_ALERT_WEBHOOK_URL;
    expect(() => assertProductionAlertingConfigured()).toThrow(/OPS_ALERT/);

    process.env.NEXA_ENV = 'dogfood';
    expect(() => assertProductionMonitoringConfigured()).not.toThrow();
    expect(() => assertProductionAlertingConfigured()).not.toThrow();
  });

  it('createErrorMonitoring is noop in test without DSN', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ERROR_MONITORING_DSN;
    const mon = createErrorMonitoring({ service: 'test' });
    expect(mon).toBeInstanceOf(NoopErrorMonitoring);
  });

  it('dedupes alerts within window', async () => {
    const calls: string[] = [];
    const inner = {
      alert: async (p: { key: string }) => {
        calls.push(p.key);
      },
      resolve: async () => undefined,
    };
    const dedupe = new DedupingAlertingService(inner as never, 60_000, 60_000);
    await dedupe.alert({
      key: 'HTTP_5XX',
      severity: 'P1',
      message: 'a',
      fingerprint: 'fp1',
    });
    await dedupe.alert({
      key: 'HTTP_5XX',
      severity: 'P1',
      message: 'a',
      fingerprint: 'fp1',
    });
    expect(calls.filter((k) => k === 'HTTP_5XX').length).toBe(1);
  });

  it('severity policy documents P0 financial integrity', () => {
    expect(ALERT_SEVERITY_POLICY.P0.page).toBe(true);
    expect(ObsEvents.FINANCIAL_INVARIANT_VIOLATION).toBe(
      'FINANCIAL_INVARIANT_VIOLATION',
    );
    expect(ConsoleAlertingService).toBeDefined();
  });

  it('installFatalHandlers captures unhandledRejection without throwing', async () => {
    const captured: unknown[] = [];
    const monitoring = {
      captureException: (e: unknown) => captured.push(e),
      captureMessage: () => undefined,
      setContext: () => undefined,
      setUser: () => undefined,
      flush: async () => true,
    };
    installFatalHandlers({
      service: 'test',
      monitoring: monitoring as never,
      exitOnUncaught: false,
    });
    process.emit('unhandledRejection', new Error('boom'), Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));
    expect(captured.length).toBeGreaterThanOrEqual(1);
  });
});
