import { generateKeyPairSync, createPublicKey } from 'crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtKeysService {
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
