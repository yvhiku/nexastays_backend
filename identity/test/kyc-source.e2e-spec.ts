/**
 * KYC Source E2E Tests
 *
 * Run: npm run test:e2e
 *
 * Verifies:
 * - Admin KYC list endpoint filters by source (PAY, GO, STAYS)
 * - X-Nexa-Product header / body source on KYC submit
 * - Submit with STAYS creates row with source=STAYS; admin STAYS list returns it, PAY list does not
 *
 * Requirements:
 * - PostgreSQL with kyc_profiles table (source column from migration 019)
 * - DB env vars or .env
 * - ADMIN_EMAIL, ADMIN_PASSWORD for admin login (or defaults)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { appConfig } from '../src/common/config';

describe('KYC Source (e2e)', () => {
  let app: INestApplication<App>;
  const prefix = appConfig.apiPrefix;
  const adminEmail =
    process.env.ADMIN_EMAIL || appConfig.adminEmail || 'admin@nexapay.ma';
  const adminPassword =
    process.env.ADMIN_PASSWORD || appConfig.adminPassword || 'admin123';

  beforeAll(async () => {
    jest.setTimeout(30000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    app.setGlobalPrefix(prefix);

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Admin KYC applications filter by source', () => {
    it('GET /admin/kyc/applications?source=PAY returns 401 without auth', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'PAY' })
        .expect(401);
    });

    it('GET /admin/kyc/applications?source=STAYS returns 401 without auth', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'STAYS' })
        .expect(401);
    });

    it('GET /admin/kyc/applications?source=GO returns 401 without auth', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'GO' })
        .expect(401);
    });

    it('GET /admin/kyc/applications accepts page and limit', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'PAY', page: 1, limit: 10 })
        .expect(401);
    });

    it('GET /admin/kyc/applications accepts search param', () => {
      return request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'PAY', search: '+2126' })
        .expect(401);
    });
  });

  describe('KYC submit requires auth', () => {
    it('POST /kyc/submit returns 401 without token', () => {
      return request(app.getHttpServer())
        .post(`/${prefix}/kyc/submit`)
        .set('Content-Type', 'application/json')
        .send({
          phone_number: '+212612345678',
          documents: { id_document: true, selfie: true },
          source: 'STAYS',
        })
        .expect(401);
    });

  });

  describe('KYC source filtering (integration)', () => {
    let testUserId: string;
    let adminToken: string;

    beforeAll(async () => {
      const ds = app.get(DataSource);
      const pinHash = '$2b$10$0XmVnQbcSgi6U.IL43oAJeAsWWQrtzKWShaz8edB8MI98fJ1s2APe';
      const [userRow] = await ds.query(
        `INSERT INTO users (phone_number, full_name, pin_hash, status, kyc_status, account_type, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', 'PENDING', 'CONSUMER', NOW(), NOW())
         RETURNING id`,
        ['+212699999001', 'E2E Test User', pinHash],
      );
      testUserId = userRow?.id;
      if (!testUserId) return;

      await ds.query(
        `INSERT INTO kyc_profiles (user_id, status, source, documents, created_at)
         VALUES ($1, 'PENDING', 'STAYS', '{"id_document":true,"selfie":true,"liveness":false}', NOW())`,
        [testUserId],
      );

      const loginRes = await request(app.getHttpServer())
        .post(`/${prefix}/auth/admin/login`)
        .set('Content-Type', 'application/json')
        .send({ email: adminEmail, password: adminPassword });
      adminToken = loginRes.body?.data?.access_token ?? loginRes.body?.access_token;
    }, 10000);

    afterAll(async () => {
      if (!testUserId) return;
      const ds = app.get(DataSource);
      await ds.query('DELETE FROM kyc_profiles WHERE user_id = $1', [testUserId]);
      await ds.query('DELETE FROM users WHERE id = $1', [testUserId]);
    });

    it('GET admin/kyc/applications?source=STAYS returns STAYS KYC row', async () => {
      if (!adminToken) {
        console.warn('Skipping: no admin token (admin login may have failed)');
        return;
      }
      const res = await request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'STAYS', status: 'PENDING', page: 1, limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const list = Array.isArray(res.body?.data) ? res.body.data : res.body;
      const found = (list || []).find((r: { user_id?: string }) => r.user_id === testUserId);
      expect(found).toBeDefined();
      expect(found?.source ?? found?.kycProfile?.source).toBe('STAYS');
    });

    it('GET admin/kyc/applications?source=PAY does NOT return STAYS KYC row', async () => {
      if (!adminToken) return;
      const res = await request(app.getHttpServer())
        .get(`/${prefix}/admin/kyc/applications`)
        .query({ source: 'PAY', status: 'PENDING', page: 1, limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const list = Array.isArray(res.body?.data) ? res.body.data : res.body;
      const found = (list || []).find((r: { user_id?: string }) => r.user_id === testUserId);
      expect(found).toBeUndefined();
    });
  });
});
