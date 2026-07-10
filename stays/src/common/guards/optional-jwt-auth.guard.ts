import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optionally authenticate JWT when Authorization Bearer is present.
 * Used on public browse endpoints so ownership-gated fields (e.g. full address)
 * can be revealed for the logged-in owner without requiring auth for anonymous users.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Invalid/expired token on public routes → treat as anonymous (do not 401 browse)
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
