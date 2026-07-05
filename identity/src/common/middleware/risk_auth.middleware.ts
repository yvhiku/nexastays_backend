import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { User } from '../../modules/users/entities/user.entity';
import { AuditLog } from '../../modules/audit/entities/audit-log.entity';
import { RiskAlert } from '../../modules/admin/entities/risk-alert.entity';
import { SecurityEventsService } from '../../modules/security-events/security-events.service';

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

type RiskAuthRequest = Request & { risk_auth?: RiskAuthAssessment };

@Injectable()
export class RiskAuthMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(RiskAlert)
    private readonly riskAlertRepository: Repository<RiskAlert>,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  private get mediumThreshold(): number {
    return Number(process.env.RISK_AUTH_MEDIUM_THRESHOLD ?? 50);
  }

  private get highThreshold(): number {
    return Number(process.env.RISK_AUTH_HIGH_THRESHOLD ?? 80);
  }

  async use(req: RiskAuthRequest, _res: Response, next: NextFunction) {
    const assessment = await this.buildAssessment(req);
    req.risk_auth = assessment;
    if (assessment.reason_codes.length > 0) {
      await this.securityEventsService.logEvent({
        user_id: assessment.user_id,
        event_type: 'DEVICE_ANOMALY',
        metadata: {
          risk_score: assessment.risk_score,
          risk_level: assessment.level,
          reason_codes: assessment.reason_codes,
          country: assessment.context.country,
          device_fingerprint: assessment.context.device_fingerprint,
        },
        ip_address: assessment.context.ip,
        device_id: assessment.context.device_id,
      });
    }
    if (assessment.level === 'HIGH' && assessment.user_id) {
      await this.riskAlertRepository.save({
        type: 'ADAPTIVE_AUTH_HIGH_RISK',
        severity: 'HIGH',
        user_id: assessment.user_id,
        transaction_id: null,
        description: `High-risk adaptive auth event: ${assessment.reason_codes.join(', ')}`,
        risk_score: assessment.risk_score,
        status: 'OPEN',
      });
    }
    next();
  }

  private async buildAssessment(
    req: RiskAuthRequest,
  ): Promise<RiskAuthAssessment> {
    const userId = await this.resolveTargetUserId(req);
    const context = this.extractContext(req);
    if (!userId) {
      return {
        user_id: null,
        risk_score: 0,
        level: 'LOW',
        reason_codes: [],
        context,
      };
    }

    const lastLoginAudit = await this.auditRepository.findOne({
      where: { user_id: userId, action: 'LOGIN_SUCCESS' },
      order: { created_at: 'DESC' },
    });
    const previous = this.parsePreviousContext(lastLoginAudit?.metadata);

    let score = 0;
    const reasons: string[] = [];

    if (previous.ip && previous.ip !== context.ip) {
      score += 30;
      reasons.push('IP_CHANGED');
    }
    if (
      previous.country &&
      context.country &&
      previous.country.toUpperCase() !== context.country.toUpperCase()
    ) {
      score += 35;
      reasons.push('GEO_ANOMALY_COUNTRY_CHANGED');
    }
    if (
      previous.device_fingerprint &&
      previous.device_fingerprint !== context.device_fingerprint
    ) {
      score += 40;
      reasons.push('DEVICE_FINGERPRINT_MISMATCH');
    }

    const level: RiskAuthLevel =
      score >= this.highThreshold
        ? 'HIGH'
        : score >= this.mediumThreshold
          ? 'MEDIUM'
          : 'LOW';

    return {
      user_id: userId,
      risk_score: score,
      level,
      reason_codes: reasons,
      context,
    };
  }

  private async resolveTargetUserId(
    req: RiskAuthRequest,
  ): Promise<string | null> {
    const jwtUserId = (req as Request & { user?: { userId?: string } }).user
      ?.userId;
    if (jwtUserId) return jwtUserId;

    const phone = this.getString(req.body?.phone_number);
    if (!phone) return null;
    const accountType = this.getString(req.body?.account_type) ?? 'CONSUMER';
    const user = await this.userRepository.findOne({
      where: { phone_number: phone, account_type: accountType as any },
      select: ['id'],
    });
    return user?.id ?? null;
  }

  private extractContext(req: Request): RiskAuthAssessment['context'] {
    const ip =
      (req.ip || '').trim() ||
      ((req.connection as { remoteAddress?: string } | undefined)
        ?.remoteAddress ??
        '') ||
      '0.0.0.0';
    const country =
      this.getString(req.headers['cf-ipcountry']) ||
      this.getString(req.headers['x-country-code']) ||
      this.getString(req.headers['x-geo-country']) ||
      null;
    const deviceId = this.getString(req.headers['x-device-id']) ?? null;
    const userAgent = this.getString(req.headers['user-agent']) ?? null;
    const explicitFingerprint = this.getString(
      req.headers['x-device-fingerprint'],
    );
    const fingerprintSource =
      explicitFingerprint || `${deviceId || ''}|${userAgent || ''}`;
    const deviceFingerprint = createHash('sha256')
      .update(fingerprintSource)
      .digest('hex');
    return {
      ip,
      country,
      device_id: deviceId,
      device_fingerprint: deviceFingerprint,
      user_agent: userAgent,
    };
  }

  private parsePreviousContext(
    metadata: Record<string, unknown> | undefined | null,
  ): { ip?: string; country?: string; device_fingerprint?: string } {
    if (!metadata || typeof metadata !== 'object') return {};
    return {
      ip: this.getString(metadata.ip),
      country: this.getString(metadata.country),
      device_fingerprint: this.getString(metadata.device_fingerprint),
    };
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
