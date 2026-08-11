import { readFileSync } from 'fs';
import { join } from 'path';
import { isTwilioConfigured } from '../../modules/sms/sms-config';

describe('Twilio env naming Phase 1', () => {
  it('recognizes TWILIO_PHONE_NUMBER as the runtime From number', () => {
    expect(
      isTwilioConfigured({
        TWILIO_ACCOUNT_SID: 'AC',
        TWILIO_AUTH_TOKEN: 'tok',
        TWILIO_PHONE_NUMBER: '+15555550100',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isTwilioConfigured({
        TWILIO_ACCOUNT_SID: 'AC',
        TWILIO_AUTH_TOKEN: 'tok',
        TWILIO_FROM_NUMBER: '+15555550100',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('deploy env examples no longer document TWILIO_FROM_NUMBER', () => {
    const deployEnv = join(__dirname, '../../../../deploy/env');
    for (const name of [
      'dogfood.env.example',
      'staging.env.example',
      'production.env.example',
    ]) {
      const text = readFileSync(join(deployEnv, name), 'utf8');
      expect(text).toMatch(/TWILIO_PHONE_NUMBER=/);
      expect(text).not.toMatch(/^TWILIO_FROM_NUMBER=/m);
      expect(text).not.toMatch(/\nTWILIO_FROM_NUMBER=/);
    }
  });
});
