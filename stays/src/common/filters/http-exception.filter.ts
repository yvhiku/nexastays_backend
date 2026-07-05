import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Standard error envelope (opt-in via x-api-envelope: 1): { data: null, error: { code, message, details? } } */
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

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const res = exception.getResponse();
    const message =
      typeof res === 'object' && res && 'message' in res
        ? (res as { message?: string | string[] }).message
        : exception.message;
    const messageStr = Array.isArray(message)
      ? message.join(', ')
      : String(message);
    const code =
      typeof res === 'object' && res && 'error' in res
        ? String((res as { error?: string }).error ?? 'HTTP_ERROR')
        : 'HTTP_ERROR';
    const details =
      typeof res === 'object' &&
      res &&
      'message' in res &&
      Array.isArray((res as { message?: string[] }).message)
        ? (res as { message: string[] }).message
        : undefined;
    const requestId = (request as Request & { requestId?: string }).requestId;

    if (wantsEnvelope(request)) {
      // Envelope mode: always include meta.requestId for a predictable contract
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

    // Legacy error shape (no envelope): statusCode, timestamp, path, message[, code]
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
