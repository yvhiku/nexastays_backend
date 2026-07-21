import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { getInternalServiceKey } from '../security/secrets';

/** Validates X-Internal-Key for service-to-service routes. */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const key = req.headers['x-internal-key'];
    if (!key || key !== getInternalServiceKey()) {
      throw new ForbiddenException('Invalid internal service key');
    }
    return true;
  }
}
