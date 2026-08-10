import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController health PROD-OPS-005', () => {
  const metrics = { getMetrics: jest.fn().mockReturnValue({}) };

  it('liveness does not depend on DB', async () => {
    const db = { check: jest.fn().mockResolvedValue(false) };
    const service = new AppService(db as never);
    const controller = new AppController(service, metrics as never);
    const live = controller.getLive();
    expect(live.status).toBe('ok');
    expect(live.check).toBe('live');
    expect(db.check).not.toHaveBeenCalled();
  });

  it('readiness returns 503 semantics when DB down', async () => {
    const db = { check: jest.fn().mockResolvedValue(false) };
    const service = new AppService(db as never);
    const controller = new AppController(service, metrics as never);
    await expect(controller.getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('GET /health sets status 503 when degraded/unavailable', async () => {
    const db = { check: jest.fn().mockResolvedValue(false) };
    const service = new AppService(db as never);
    const controller = new AppController(service, metrics as never);
    const res = { status: jest.fn() } as never;
    const body = await controller.getHealth(res);
    expect(body.ok).toBe(false);
    expect((res as any).status).toHaveBeenCalledWith(503);
  });

  it('version exposes metadata without secrets', () => {
    process.env.GIT_SHA = 'abc123';
    process.env.BUILD_VERSION = '1.2.3';
    const db = { check: jest.fn() };
    const service = new AppService(db as never);
    const controller = new AppController(service, metrics as never);
    const v = controller.getVersion();
    expect(v.git_sha).toBe('abc123');
    expect(v.version).toBe('1.2.3');
    expect(JSON.stringify(v)).not.toMatch(/password|private_key|secret/i);
  });
});
