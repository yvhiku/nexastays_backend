import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

/** Standard success envelope (opt-in via x-api-envelope: 1): { data, meta?, error: null } */
export interface ApiSuccessEnvelope<T> {
  data: T;
  meta?: { requestId?: string; [k: string]: unknown };
  error: null;
}

export interface Response<T> {
  data: T;
  meta?: { requestId?: string; [k: string]: unknown };
  error: null;
}

function wantsEnvelope(req: Request): boolean {
  const raw = req.headers['x-api-envelope'];
  if (raw === undefined || raw === null) return false;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  return s === '1' || s.toLowerCase() === 'true';
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | T> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string }>();
    const useEnvelope = wantsEnvelope(request);
    const requestId = request.requestId;
    return next.handle().pipe(
      map((data: unknown) => {
        if (!useEnvelope) {
          return data as T;
        }
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'error' in data &&
          (data as { error: unknown }).error === null
        ) {
          return data as Response<T>;
        }
        // Envelope mode: always include meta.requestId for a predictable contract
        const meta = { requestId: requestId ?? '' };
        return { data: data as T, meta, error: null };
      }),
    );
  }
}
