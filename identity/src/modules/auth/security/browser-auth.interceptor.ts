import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import {
  isBrowserCookieRequest,
  refreshCookieName,
  setBrowserAuthCookies,
} from './browser-auth-cookies';

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  [key: string]: unknown;
};

/**
 * Cookie transport (X-Auth-Transport: cookie):
 * - Set HttpOnly refresh cookie
 * - Never set ambient access cookie (ADR-005 / PROD-SEC-001)
 * - Strip refresh_token from JSON body (JS must not read it)
 * - Leave access_token in JSON for in-memory Bearer use
 */
@Injectable()
export class BrowserAuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    if (!isBrowserCookieRequest(request)) return next.handle();

    return next.handle().pipe(
      map((value: unknown) => {
        if (!value || typeof value !== 'object') return value;
        const result = value as TokenResponse;
        if (typeof result.access_token !== 'string') return value;
        setBrowserAuthCookies(
          response,
          {
            access_token: result.access_token,
            refresh_token:
              typeof result.refresh_token === 'string'
                ? result.refresh_token
                : undefined,
          },
          refreshCookieName(request),
        );
        const { refresh_token: _refreshToken, ...safeResult } = result;
        return safeResult;
      }),
    );
  }
}
