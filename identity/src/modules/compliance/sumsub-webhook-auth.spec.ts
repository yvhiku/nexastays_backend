import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { sumsubConfig } from '../../common/config/app.config';
import { ComplianceService } from './compliance.service';

describe('Sumsub webhook raw-body authentication', () => {
  const originalSecret = sumsubConfig.webhookSecret;
  const secret = 'isolated-webhook-test-secret';
  const raw = Buffer.from('{"type":"applicantCreated"}');
  // No external user ID: valid requests stop before database/provider operations.
  const payload = { type: 'applicantCreated' };
  const service = new ComplianceService({} as never, {} as never);

  beforeEach(() => {
    sumsubConfig.webhookSecret = secret;
  });

  afterEach(() => {
    sumsubConfig.webhookSecret = originalSecret;
  });

  it.each([
    ['HMAC_SHA256_HEX', 'sha256'],
    ['HMAC_SHA512_HEX', 'sha512'],
    ['HMAC_SHA1_HEX', 'sha1'],
  ])('accepts a valid %s digest over the exact raw bytes', async (header, alg) => {
    const digest = createHmac(alg, secret).update(raw).digest('hex');
    await expect(service.processSumsubWebhook(payload, raw, digest, header))
      .resolves.toMatchObject({ received: true, updated: false });
  });

  it('rejects a modified body even when the original digest is valid', async () => {
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    await expect(service.processSumsubWebhook(payload, Buffer.from('{}'), digest))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([undefined, '', '00', 'not-a-digest'])('rejects missing or malformed digest %s', async (digest) => {
    await expect(service.processSumsubWebhook(payload, raw, digest))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request when no dedicated webhook secret is configured', async () => {
    sumsubConfig.webhookSecret = '';
    await expect(service.processSumsubWebhook(payload, raw, '00'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported signature algorithms', async () => {
    await expect(service.processSumsubWebhook(payload, raw, '00', 'HMAC_MD5_HEX'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
