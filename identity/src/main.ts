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
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor } from './common/interceptors';
import { safeLogger } from './common/logging/safe-logger';
import { createHttpTelemetryMiddleware, initOpenTelemetry } from '@nexa/telemetry';
import { applySecureHttp } from './common/security/secure-http';

async function bootstrap() {
  initOpenTelemetry('nexa-identity');
  // Production: require secrets so auth material is never ephemeral / defaulted
  if (process.env.NODE_ENV === 'production') {
    void appConfig.kycHashPepper;
    void appConfig.refreshTokenPepper;
    void appConfig.otpPepper;
    appConfig.resolvePaymentHmacSecrets();
    if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
      throw new Error(
        'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production.',
      );
    }
    if (process.env.DEMO_OTP_CODE) {
      throw new Error(
        'DEMO_OTP_CODE must not be set in production.',
      );
    }
    if (!process.env.ADMIN_PASSWORD_HASH) {
      throw new Error(
        'ADMIN_PASSWORD_HASH (Argon2id) is required in production. Do not use plaintext ADMIN_PASSWORD.',
      );
    }
    if (!process.env.DB_PASSWORD?.trim()) {
      throw new Error('DB_PASSWORD is required in production.');
    }
    if (!process.env.INTERNAL_SERVICE_KEY?.trim()) {
      throw new Error('INTERNAL_SERVICE_KEY is required in production.');
    }
    if (!process.env.CORS_ORIGINS?.trim()) {
      throw new Error(
        'CORS_ORIGINS is required in production (comma-separated https origins).',
      );
    }
    if (
      process.env.SUMSUB_APP_TOKEN?.trim() &&
      !process.env.SUMSUB_SECRET_KEY?.trim()
    ) {
      throw new Error(
        'SUMSUB_SECRET_KEY is required when SUMSUB_APP_TOKEN is set.',
      );
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  applySecureHttp(app);

  // Body size limits (JSON and urlencoded; 1MB default). Keep raw JSON bytes for
  // webhook HMAC verification before Express parses the body.
  app.use(
    json({
      limit: appConfig.bodyLimit,
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: appConfig.bodyLimit }));

  // Request ID and logging (no secrets: never log authorization, refresh_token, otp, pin, national_id_number)
  app.use(
    (
      req: Request & { requestId?: string },
      res: Response,
      next: () => void,
    ) => {
      const requestId = (req.headers['x-request-id'] as string) || randomUUID();
      req.requestId = requestId;
      res.setHeader('X-Request-Id', requestId);
      const start = Date.now();
      if (process.env.NODE_ENV !== 'test') {
        const integrityHeader = req.headers['x-device-integrity'];
        const deviceIdHeader = req.headers['x-device-id'];
        safeLogger.info('req', {
          requestId,
          method: req.method,
          path: req.path,
          deviceIntegrity:
            typeof integrityHeader === 'string'
              ? integrityHeader.slice(0, 120)
              : undefined,
          deviceId:
            typeof deviceIdHeader === 'string'
              ? deviceIdHeader.slice(0, 64)
              : undefined,
        });
      }
      res.on('finish', () => {
        if (process.env.NODE_ENV !== 'test') {
          const latency = Date.now() - start;
          const statusCode = res.statusCode;
          safeLogger.info('res', { requestId, statusCode, latencyMs: latency });
        }
      });
      next();
    },
  );
  app.use(createHttpTelemetryMiddleware({ service: 'nexa-identity' }));

  app.setGlobalPrefix(appConfig.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Nexa Identity API')
      .setVersion('1.0')
      .setDescription(
        'Nexa Identity SSO — auth, OTP, PIN, sessions, user profile, KYC.\n\n' +
          'Issues RS256 JWTs verified via `GET /.well-known/jwks.json`.',
      )
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'bearer',
      )
      .addTag('Auth', 'OTP, PIN, login, refresh')
      .addTag('Users', 'Profile, registration, consents')
      .addTag('Compliance', 'KYC submit, status, Sumsub webhooks')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${appConfig.apiPrefix}/docs`, app, document);
  }

  const origins = appConfig.corsOrigins;
  const allowOrigins = isProd
    ? origins.length > 0
      ? origins
      : (() => {
          throw new Error('CORS_ORIGINS must be set in production.');
        })()
    : true;
  app.enableCors({
    origin: allowOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Request-Id',
      'X-Device-Id',
      'X-Device-Integrity',
      'X-Nexa-Product',
      'X-Internal-Key',
    ],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  await app.listen(appConfig.port, '0.0.0.0');
  const base = `http://0.0.0.0:${appConfig.port}/${appConfig.apiPrefix}`;
  safeLogger.info('Nexa Identity started', {
    base,
    swagger:
      !isProd || process.env.ENABLE_SWAGGER === 'true'
        ? `${base}/docs`
        : 'disabled',
    jwks: `${base}/.well-known/jwks.json`,
  });
}
void bootstrap();
