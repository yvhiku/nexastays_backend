import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbHealthService } from './common/database/db-health.service';
import { MetricsService } from './common/metrics';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DbHealthService, useValue: { check: jest.fn().mockResolvedValue(true) } },
        { provide: MetricsService, useValue: { getMetrics: jest.fn().mockReturnValue({}) } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
