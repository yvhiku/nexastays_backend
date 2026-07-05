import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { KycPolicyValidationService } from './kyc-policy-validation.service';

type KycReq = Request & { user?: { userId?: string } };

/**
 * Defense-in-depth: verifies JWT then enforces coarse KYC gate before route handlers.
 * Fine-grained limits run again inside money-movement services (with the open DB txn).
 */
@Injectable()
export class KycMoneyMovementMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly kycPolicy: KycPolicyValidationService,
  ) {}

  async use(req: KycReq, _res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authorization token provided');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        auth.slice('Bearer '.length).trim(),
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid token subject');
    }
    req.user = { ...req.user, userId };
    await this.kycPolicy.assertCoarseVerifiedGate(userId, req);
    next();
  }
}
