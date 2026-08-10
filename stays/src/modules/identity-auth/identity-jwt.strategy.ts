import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwksRsa from 'jwks-rsa';
import type { Request } from 'express';
import { getJwtAudience, getJwtIssuer } from '../../common/security/jwt-claims';
import { extractBearerAccessToken } from './bearer-access-token';

function jwksUri(): string {
  const base =
    process.env.IDENTITY_BASE_URL?.replace(/\/$/, '') ||
    'http://127.0.0.1:3001/api/v1';

  return process.env.IDENTITY_JWKS_URL || `${base}/.well-known/jwks.json`;
}

/** Stateless identity JWT — no KYC/compliance fields. */
export interface IdentityJwtUser {
  userId: string;
  unified_identity_id?: string;
  account_type: string;
  role?: string;
  roles?: string[];
  /** SEC-003 admin authz version claim */
  authz_version?: number;
  av?: number;
}

@Injectable()
export class IdentityJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractBearerAccessToken(request),
      ]),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      // SEC-006: bind verification to Identity issuer + platform audience.
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: jwksUri(),
      }),
    });
  }

  validate(payload: Record<string, unknown>): IdentityJwtUser {
    const av = payload.av != null ? Number(payload.av) : undefined;
    return {
      userId: payload.sub as string,
      unified_identity_id: payload.unified_identity_id as string | undefined,
      account_type: (payload.account_type as string) ?? 'CONSUMER',
      role: payload.role as string | undefined,
      roles: payload.roles as string[] | undefined,
      authz_version: av,
      av,
    };
  }
}
