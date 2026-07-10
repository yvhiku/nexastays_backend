import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Lightweight bot / script client filter for sensitive public auth routes.
 * Enforced in production (or when ENFORCE_BOT_PROTECTION=true).
 */
@Injectable()
export class BotProtectionGuard implements CanActivate {
  private static readonly BLOCKED_UA =
    /^(curl\/|wget\/|python-requests\/|python-urllib\/|scrapy\/|go-http-client\/|java\/|libwww-perl\/|apache-httpclient\/|okhttp\/|httpie\/|aiohttp\/)/i;

  canActivate(context: ExecutionContext): boolean {
    const enforce =
      process.env.NODE_ENV === 'production' ||
      process.env.ENFORCE_BOT_PROTECTION === 'true';
    if (!enforce) return true;
    if (process.env.ALLOW_SCRIPT_CLIENTS === 'true') return true;

    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers?.['user-agent'];
    const ua = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';

    if (!ua || ua.length < 12) {
      throw new ForbiddenException('Missing or invalid client');
    }
    if (BotProtectionGuard.BLOCKED_UA.test(ua)) {
      throw new ForbiddenException('Automated clients are not allowed');
    }
    return true;
  }
}
