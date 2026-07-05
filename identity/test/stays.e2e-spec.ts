/**
 * Nexa Stays E2E Integration Tests
 *
 * Run: npm run test:e2e
 *
 * Requirements:
 * - PostgreSQL running with stays migrations applied:
 *   - database/migrations/add_stays_tables.sql
 *   - database/migrations/add_stays_production_schema.sql
 * - DB env vars: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (or .env)
 *
 * Tests:
 * - Search endpoint (public)
 * - Auth-required endpoints return 401 without token
 * - Admin endpoints return 401 without token
 * - Payment webhook (mock provider)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { appConfig } from '../src/common/config';

describe('Nexa Stays (e2e)', () => {
  let app: INestApplication<App>;
  const prefix = appConfig.apiPrefix;

  beforeAll(async () => {
    jest.setTimeout(30000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix(prefix);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Search (public)', () => {
    it('GET /stays/listings/search returns 200', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/stays/listings/search`)
        .expect(200);
    });

    it('GET /stays/listings/search with city filter returns 200', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/stays/listings/search`)
        .query({ city: 'Marrakech' })
        .expect(200);
    });

    it('GET /stays/listings/search with checkin/checkout returns 200', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/stays/listings/search`)
        .query({
          city: 'Marrakech',
          checkin_date: '2026-04-01',
          checkout_date: '2026-04-03',
        })
        .expect(200);
    });
  });

  describe('Booking create (requires auth)', () => {
    it('POST /stays/bookings returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/${prefix}/stays/bookings`)
        .send({
          listing_id: '00000000-0000-0000-0000-000000000001',
          checkin_date: '2026-04-01',
          checkout_date: '2026-04-03',
          guest_count: 1,
        })
        .expect(401);
    });
  });

  describe('Admin endpoints (require ADMIN role)', () => {
    it('GET /admin/stays/health returns 401 without token', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/stays/health`)
        .expect(401);
    });

    it('POST /admin/stays/hosts/:id/approve returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/${prefix}/admin/stays/hosts/00000000-0000-0000-0000-000000000001/approve`)
        .expect(401);
    });

    it('POST /admin/stays/listings/:id/approve returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/${prefix}/admin/stays/listings/00000000-0000-0000-0000-000000000001/approve`)
        .expect(401);
    });
  });

  describe('Payment webhook (public)', () => {
    it('POST /stays/webhooks/payments/mock returns 200', () => {
      return request(app.getHttpServer())
        .post(`/${prefix}/stays/webhooks/payments/mock`)
        .send({ provider_intent_id: 'test-intent-123' })
        .expect(200);
    });
  });
});
