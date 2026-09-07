import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { AlertingService, ErrorMonitoringService } from '@nexa/telemetry';
import { ObsEvents } from '@nexa/telemetry';
import { noteApiError } from '../security/security-traffic';
import {
  ALERTING,
  ERROR_MONITORING,
} from '../observability/observability.tokens';

/** Standard error envelope (opt-in via x-api-envelope: 1) */
export interface ApiErrorEnvelope {
  data: null;
  meta?: { requestId?: string };
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function wantsEnvelope(req: Request): boolean {
  const raw = req.headers['x-api-envelope'];
  if (raw === undefined || raw === null) return false;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  return s === '1' || s.toLowerCase() === 'true';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Optional()
    @Inject(ERROR_MONITORING)
    private readonly monitoring?: ErrorMonitoringService,
    @Optional()
    @Inject(ALERTING)
    private readonly alerting?: AlertingService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const res = isHttp ? exception.getResponse() : null;
    const message =
      typeof res === 'object' && res && 'message' in res
        ? (res as { message?: string | string[] }).message
        : exception instanceof Error
          ? exception.message
          : 'Internal error';
    const messageStr = Array.isArray(message)
      ? message.join(', ')
      : String(message);
    const code =
      typeof res === 'object' && res && 'error' in res
        ? String((res as { error?: string }).error ?? 'HTTP_ERROR')
        : isHttp
          ? 'HTTP_ERROR'
          : 'INTERNAL_ERROR';
    const details =
      typeof res === 'object' &&
      res &&
      'message' in res &&
      Array.isArray((res as { message?: string[] }).message)
        ? (res as { message: string[] }).message
        : undefined;
    const requestId = request.requestId;

    if (status >= 500 || status === 401 || status === 403 || status === 429) {
      noteApiError(request, status, messageStr);
    }

    if (status >= 500) {
      this.monitoring?.captureException(exception, {
        event: ObsEvents.HTTP_5XX,
        path: request.url,
        status,
        request_id: requestId,
      });
      void this.alerting?.alert({
        key: ObsEvents.HTTP_5XX,
        severity: 'P1',
        message: `HTTP ${status} on ${request.method} ${request.path}`,
        fingerprint: `http5xx:${request.method}:${request.route?.path ?? request.path}`,
        context: { status, path: request.path, request_id: requestId },
      });
    }

    if (wantsEnvelope(request)) {
      const body: ApiErrorEnvelope = {
        data: null,
        meta: { requestId: requestId ?? '' },
        error: {
          code,
          message: messageStr,
          ...(details && { details }),
        },
      };
      response.status(status).json(body);
      return;
    }

    const legacyBody: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: messageStr,
    };
    if (typeof res === 'object' && res && 'error' in res) {
      legacyBody.code = (res as { error?: string }).error;
    }
    response.status(status).json(legacyBody);
  }
}
