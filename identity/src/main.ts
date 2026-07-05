import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appConfig } from './common/config';
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor } from './common/interceptors';
import { safeLogger } from './common/logging/safe-logger';
import { createHttpTelemetryMiddleware, initOpenTelemetry } from '@nexa/telemetry';

async function bootstrap() {
  initOpenTelemetry('nexa-identity');
  // Production: require KYC_HASH_PEPPER so CNIE hashes are stable and independent of JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    void appConfig.kycHashPepper;
    appConfig.resolvePaymentHmacSecrets();
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.disable('x-powered-by');

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

  // Global prefix
  app.setGlobalPrefix(appConfig.apiPrefix);

  // Global validation pipe (strict: whitelist, forbid extra props, explicit types)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger / OpenAPI
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

  // CORS: production = allowed origins only; development = localhost + env origins
  const origins = appConfig.corsOrigins;
  const isProd = process.env.NODE_ENV === 'production';
  const allowOrigins = isProd
    ? origins.length > 0
      ? origins
      : ['https://nexa.ma', 'https://admin.nexa.ma']
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
    ],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Listen on all network interfaces (0.0.0.0) to allow connections from other devices
  await app.listen(appConfig.port, '0.0.0.0');
  const base = `http://0.0.0.0:${appConfig.port}/${appConfig.apiPrefix}`;
  safeLogger.info('Nexa Identity started', { base, swagger: `${base}/docs`, jwks: `${base}/.well-known/jwks.json` });
}
void bootstrap();
