import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global throttle: prefer rate-limit by user id when authenticated, else by IP.
 * Note: For JWT-protected routes, auth runs after this guard, so req.user may be
 * unset here; in that case we fall back to IP (120/min per IP).
 * Admin routes (/admin/*) are never throttled.
 */
@Injectable()
export class ThrottlerKeyGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = (request.url || request.path || '').split('?')[0];
    if (path.includes('/admin/')) return true;
    // Skip throttle for /users/me (profile) - heavily used, has its own cache
    if (path.includes('/users/me') && request.method === 'GET') return true;
    // Skip throttle for GET host/verification - read-only, called often on host pages
    if (path.includes('/stays/host/verification') && request.method === 'GET') return true;
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: string } | undefined;
    const sub = user?.sub;
    if (sub && typeof sub === 'string') {
      return `user:${sub}`;
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
    return ipStr || '0.0.0.0';
  }
}
