import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { appConfig } from './common/config';
import { TransformInterceptor } from './common/interceptors';
import { safeLogger } from './common/logging/safe-logger';
import {
  assertProductionAlertingConfigured,
  assertProductionMonitoringConfigured,
  createErrorMonitoring,
  createHttpTelemetryMiddleware,
  initOpenTelemetry,
  installFatalHandlers,
  resolveRequestId,
  runWithRequestContext,
} from '@nexa/telemetry';
import {
  applySecureHttp,
  resolveCorsOrigin,
} from './common/security/secure-http';
import { enforceCookieRequestOrigin } from './common/security/cookie-csrf';
import { getJwtAudience, getJwtIssuer } from './common/security/jwt-claims';
import { resolveNexaStage } from './common/security/cors-origins';
import { assertPaymentProviderPolicy } from './modules/stays/payments/payment-provider.config';
import { assertProductionMediaStorageConfigured } from './common/media/media-storage-policy';
import { assertStaysProductionEnvPolicy } from './common/security/production-env-policy';

async function bootstrap() {
  initOpenTelemetry('nexa-stays');
  const monitoring = createErrorMonitoring({ service: 'nexa-stays' });
  installFatalHandlers({ service: 'nexa-stays', monitoring });
  assertProductionMonitoringConfigured();
  assertProductionAlertingConfigured();

  // PROD-OPS-002: payment provider policy (dogfood/staging/production).
  assertPaymentProviderPolicy();

  // PROD-SEC-002: production object storage fail-closed (MEDIA_SERVICE_URL).
  assertProductionMediaStorageConfigured();

  // Phase 1: weak secrets / loopback URL fail-closed when NODE_ENV=production.
  assertStaysProductionEnvPolicy();

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DB_PASSWORD?.trim()) {
      throw new Error('DB_PASSWORD is required in production.');
    }
    if (!process.env.INTERNAL_SERVICE_KEY?.trim()) {
      throw new Error('INTERNAL_SERVICE_KEY is required in production.');
    }
    const piiKey = Buffer.from(
      process.env.PII_ENCRYPTION_KEY?.trim() ?? '',
      'base64',
    );
    if (piiKey.length !== 32) {
      throw new Error(
        'PII_ENCRYPTION_KEY must be a base64-encoded 32-byte key in production.',
      );
    }
    if (!process.env.IDENTITY_JWKS_URL?.trim()) {
      throw new Error('IDENTITY_JWKS_URL is required in production.');
    }
    if (!process.env.IDENTITY_BASE_URL?.trim()) {
      throw new Error('IDENTITY_BASE_URL is required in production.');
    }
    if (!process.env.CORS_ORIGINS?.trim()) {
      throw new Error(
        'CORS_ORIGINS is required in production (comma-separated https origins).',
      );
    }
    if (process.env.STAYS_PAYMENT_PROVIDER === 'cmi') {
      if (!process.env.CMI_STORE_KEY?.trim() || !process.env.CMI_CLIENT_ID?.trim()) {
        throw new Error(
          'CMI_CLIENT_ID and CMI_STORE_KEY are required when STAYS_PAYMENT_PROVIDER=cmi.',
        );
      }
    }
    // SEC-006: issuer/audience required in production.
    void getJwtIssuer();
    void getJwtAudience();
  }

  // SEC-005 / PROD-OPS-002: dogfood/staging/production require explicit CORS allowlists.
  const stage = resolveNexaStage();
  if (stage === 'staging' || stage === 'production' || stage === 'dogfood') {
    void resolveCorsOrigin();
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.enableShutdownHooks();

  applySecureHttp(app);
  app.use(json({ limit: appConfig.bodyLimit }));
  app.use(urlencoded({ extended: true, limit: appConfig.bodyLimit }));
  app.use((req: Request & { requestId?: string }, res: Response, next: () => void) => {
    const requestId = resolveRequestId(
      req.headers as Record<string, string | string[] | undefined>,
      () => randomUUID(),
    );
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const start = Date.now();
    runWithRequestContext({ requestId }, () => {
      if (process.env.NODE_ENV !== 'test') {
        safeLogger.info('http.request.start', {
          method: req.method,
          path: req.path,
        });
      }
      res.on('finish', () => {
        if (process.env.NODE_ENV !== 'test') {
          safeLogger.info('http.request.end', {
            request_id: requestId,
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
          });
        }
      });
      next();
    });
  });
  app.use(createHttpTelemetryMiddleware({ service: 'nexa-stays' }));

  app.setGlobalPrefix(appConfig.apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Nexa Stays API')
      .setVersion('1.0')
      .setDescription('Independent Nexa Stays backend. Auth via Nexa Identity JWT (RS256/JWKS).')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${appConfig.apiPrefix}/docs`, app, document);
  }

  const corsOrigin = resolveCorsOrigin();
  app.use(enforceCookieRequestOrigin(corsOrigin));
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Request-Id',
      'X-Device-Id',
      'X-Internal-Key',
      'X-Auth-Transport',
      'X-Nexa-Client',
    ],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  await app.listen(appConfig.port, '0.0.0.0');
  const base = `http://0.0.0.0:${appConfig.port}/${appConfig.apiPrefix}`;
  safeLogger.info('Nexa Stays started', {
    base,
    swagger: !isProd || process.env.ENABLE_SWAGGER === 'true' ? `${base}/docs` : 'disabled',
  });
}
void bootstrap();
