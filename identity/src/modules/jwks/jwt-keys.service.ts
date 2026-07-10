import { generateKeyPairSync, createPublicKey } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class JwtKeysService {
  private readonly logger = new Logger(JwtKeysService.name);
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;
  readonly kid = process.env.JWT_KEY_ID || 'nexa-identity-1';

  constructor() {
    const privateFromEnv = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const publicFromEnv = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (privateFromEnv && publicFromEnv) {
      this.privateKeyPem = privateFromEnv;
      this.publicKeyPem = publicFromEnv;
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production. Ephemeral keys are not allowed.',
      );
    }

    this.logger.warn(
      'JWT_PRIVATE_KEY/JWT_PUBLIC_KEY unset — generating ephemeral RSA keys (dev only)',
    );
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
  }

  get privateKey(): string {
    return this.privateKeyPem;
  }

  get publicKey(): string {
    return this.publicKeyPem;
  }

  getJwks() {
    const pub = createPublicKey(this.publicKeyPem);
    const jwk = pub.export({ format: 'jwk' }) as { n?: string; e?: string };
    return {
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: this.kid,
          n: jwk.n ?? '',
          e: jwk.e ?? '',
        },
      ],
    };
  }
}
