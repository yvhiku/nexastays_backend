import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('Stays AppController health PROD-OPS-005', () => {
  const metrics = { getMetrics: jest.fn().mockReturnValue({}) };

  it('liveness ignores DB', () => {
    const db = { check: jest.fn().mockResolvedValue(false) };
    const controller = new AppController(new AppService(db as never), metrics as never);
    expect(controller.getLive().check).toBe('live');
    expect(db.check).not.toHaveBeenCalled();
  });

  it('ready throws when DB unavailable', async () => {
    const db = { check: jest.fn().mockResolvedValue(false) };
    const controller = new AppController(new AppService(db as never), metrics as never);
    await expect(controller.getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
