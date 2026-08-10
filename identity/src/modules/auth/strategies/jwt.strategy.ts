import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtKeysService } from '../../jwks/jwt-keys.service';
import type { Request } from 'express';
import { extractBearerAccessToken } from '../security/bearer-access-token';
import { getJwtAudience, getJwtIssuer } from '../../../common/security/jwt-claims';

export interface JwtPayload {
  sub: string;
  phone_number?: string;
  role?: string;
  roles?: string[];
  email?: string;
  type?: string;
  account_type?: string;
  unified_identity_id?: string;
  session_id?: string;
  auth_method?: string;
  kyc_verified?: boolean;
  kyc_tier?: string;
  /** SEC-003 admin authz version */
  av?: number;
  iss?: string;
  aud?: string | string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly jwtKeys: JwtKeysService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => extractBearerAccessToken(request),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtKeys.publicKey,
      algorithms: ['RS256'],
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type === 'otp_session' || payload.type === 'identity_session') {
      return {
        userId: payload.sub,
        type: payload.type,
        phone_number: payload.phone_number,
        unified_identity_id: payload.unified_identity_id,
      };
    }
    return {
      userId: payload.sub,
      account_type: payload.account_type ?? 'CONSUMER',
      unified_identity_id: payload.unified_identity_id,
      session_id: payload.session_id,
      auth_method: payload.auth_method,
      role: payload.role,
      roles: payload.roles,
      email: payload.email,
      phone_number: payload.phone_number,
      kyc_verified: payload.kyc_verified === true,
      kyc_tier: payload.kyc_tier,
      authz_version: payload.av,
      av: payload.av,
    };
  }
}
