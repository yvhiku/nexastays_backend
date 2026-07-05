import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { KycPolicyValidationService } from './kyc-policy-validation.service';

/**
 * Runs after JwtAuthGuard: same coarse gate as {@link KycMoneyMovementMiddleware}
 * for routes where middleware is not applied.
 */
@Injectable()
export class KycMoneyMovementCoarseGuard implements CanActivate {
  constructor(private readonly kycPolicy: KycPolicyValidationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User context missing');
    }
    await this.kycPolicy.assertCoarseVerifiedGate(userId, req);
    return true;
  }
}
