import { ForbiddenException } from '@nestjs/common';
import { ObservabilityInternalController } from './observability-internal.controller';

describe('ObservabilityInternalController', () => {
  const monitoring = {
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    setContext: jest.fn(),
    setUser: jest.fn(),
    flush: jest.fn(),
  };
  const alerting = { alert: jest.fn(), resolve: jest.fn() };

  const origKey = process.env.INTERNAL_SERVICE_KEY;
  const origEnv = process.env.NEXA_ENV;
  const origEnable = process.env.ENABLE_OBSERVABILITY_TEST;

  afterEach(() => {
    process.env.INTERNAL_SERVICE_KEY = origKey;
    process.env.NEXA_ENV = origEnv;
    process.env.ENABLE_OBSERVABILITY_TEST = origEnable;
    jest.clearAllMocks();
  });

  it('rejects missing internal key', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    const c = new ObservabilityInternalController(
      monitoring as never,
      alerting as never,
    );
    await expect(c.testAlert(undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('disables test alert in real production without ENABLE flag', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NEXA_ENV = 'production';
    delete process.env.ENABLE_OBSERVABILITY_TEST;
    const c = new ObservabilityInternalController(
      monitoring as never,
      alerting as never,
    );
    await expect(c.testAlert('secret-key')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows dogfood with internal key', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'secret-key';
    process.env.NEXA_ENV = 'dogfood';
    const c = new ObservabilityInternalController(
      monitoring as never,
      alerting as never,
    );
    await expect(c.testAlert('secret-key')).resolves.toEqual({
      ok: true,
      event: 'OBSERVABILITY_TEST',
    });
    expect(alerting.alert).toHaveBeenCalled();
  });
});
