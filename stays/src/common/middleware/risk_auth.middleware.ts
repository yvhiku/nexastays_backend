import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export type RiskAuthLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskAuthAssessment {
  user_id: string | null;
  risk_score: number;
  level: RiskAuthLevel;
  reason_codes: string[];
  context: {
    ip: string;
    country: string | null;
    device_id: string | null;
    device_fingerprint: string;
    user_agent: string | null;
  };
}

/** Stays defers risk scoring to Nexa Identity; pass-through stub. */
@Injectable()
export class RiskAuthMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    next();
  }
}
