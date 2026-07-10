import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { noteRateLimited } from '../security/security-traffic';

/**
 * Global throttle: prefer rate-limit by user id when authenticated, else by IP.
 */
@Injectable()
export class ThrottlerKeyGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = (request.url || request.path || '').split('?')[0];
    if (path.includes('/users/me') && request.method === 'GET') return true;
    try {
      return await super.canActivate(context);
    } catch (err) {
      if (err instanceof ThrottlerException) {
        noteRateLimited(request);
      }
      throw err;
    }
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: string; userId?: string } | undefined;
    const id = user?.userId || user?.sub;
    if (id && typeof id === 'string') {
      return `user:${id}`;
    }
    const ip =
      (req as { ip?: string }).ip ||
      (req.connection as { remoteAddress?: string } | undefined)
        ?.remoteAddress ||
      (req.headers as Record<string, string | string[] | undefined>)?.[
        'x-forwarded-for'
      ];
    const ipStr = Array.isArray(ip)
      ? ip[0]
      : typeof ip === 'string'
        ? ip.split(',')[0].trim()
        : '';
    return `ip:${ipStr || '0.0.0.0'}`;
  }
}
