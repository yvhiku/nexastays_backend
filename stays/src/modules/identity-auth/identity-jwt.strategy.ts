import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwksRsa from 'jwks-rsa';

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
}

@Injectable()
export class IdentityJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: jwksUri(),
      }),
    });
  }

  validate(payload: Record<string, unknown>): IdentityJwtUser {
    return {
      userId: payload.sub as string,
      unified_identity_id: payload.unified_identity_id as string | undefined,
      account_type: (payload.account_type as string) ?? 'CONSUMER',
      role: payload.role as string | undefined,
      roles: payload.roles as string[] | undefined,
    };
  }
}
