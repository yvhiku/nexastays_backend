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
  setBrowserAuthCookies,
} from './browser-auth-cookies';

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  [key: string]: unknown;
};

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
        setBrowserAuthCookies(response, {
          access_token: result.access_token,
          refresh_token:
            typeof result.refresh_token === 'string'
              ? result.refresh_token
              : undefined,
        });
        // The browser keeps the access token only in memory. The rotating
        // refresh credential is never exposed to JavaScript.
        const { refresh_token: _refreshToken, ...safeResult } = result;
        return safeResult;
      }),
    );
  }
}
