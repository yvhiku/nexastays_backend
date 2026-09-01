import { Logger } from '@nestjs/common';
import {
  assertProductionSmsConfigured,
  isEnvoiSmsConfigured,
  resolveSmsProvider,
} from './sms-config';
import { SmsService } from './sms.service';

describe('SEC-002 SMS / OTP logging', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('assertProductionSmsConfigured', () => {
    it('allows production when EnvoiSMS is configured', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'production',
          ENVOISMS_API_KEY: 'smr_test',
        }),
      ).not.toThrow();
    });

    it('allows production when Twilio is fully configured', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'production',
          TWILIO_ACCOUNT_SID: 'ACxxxx',
          TWILIO_AUTH_TOKEN: 'token',
          TWILIO_PHONE_NUMBER: '+15555550100',
        }),
      ).not.toThrow();
    });

    it('fails closed in production when no SMS provider is set', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'production',
        }),
      ).toThrow(/SMS provider required/);
    });

    it('does not require SMS outside production', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'development',
        }),
      ).not.toThrow();
    });
  });

  describe('resolveSmsProvider', () => {
    it('prefers EnvoiSMS when API key is present', () => {
      expect(
        resolveSmsProvider({
          ENVOISMS_API_KEY: 'smr_test',
          TWILIO_ACCOUNT_SID: 'AC',
          TWILIO_AUTH_TOKEN: 'tok',
          TWILIO_PHONE_NUMBER: '+15555550100',
        } as NodeJS.ProcessEnv),
      ).toBe('envoisms');
      expect(isEnvoiSmsConfigured({ ENVOISMS_API_KEY: 'smr_test' })).toBe(true);
    });

    it('honors explicit SMS_PROVIDER=twilio', () => {
      expect(
        resolveSmsProvider({
          SMS_PROVIDER: 'twilio',
          ENVOISMS_API_KEY: 'smr_test',
          TWILIO_ACCOUNT_SID: 'AC',
          TWILIO_AUTH_TOKEN: 'tok',
          TWILIO_PHONE_NUMBER: '+15555550100',
        } as NodeJS.ProcessEnv),
      ).toBe('twilio');
    });
  });

  describe('SmsService.sendOtp logging', () => {
    const OTP = '482019';

    function collectLoggerOutput(service: SmsService): string[] {
      const lines: string[] = [];
      const capture = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };
      jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(capture as never);
      return lines;
    }

    it('non-production mock does not log the OTP value', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ENVOISMS_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;
      delete process.env.SMS_PROVIDER;

      const service = new SmsService();
      const lines = collectLoggerOutput(service);
      service.onModuleInit();

      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(true);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).not.toMatch(/verification code is:/i);
      expect(joined).toMatch(/OTP delivery suppressed in non-production/i);
    });

    it('production without provider refuses delivery and does not log OTP', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ENVOISMS_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      const service = new SmsService();
      // Bypass boot throw to exercise runtime fail-closed path.
      (service as unknown as { isConfigured: boolean }).isConfigured = false;

      const lines = collectLoggerOutput(service);
      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(false);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).not.toMatch(/verification code is:/i);
      expect(joined).toMatch(/refusing OTP delivery/i);
    });

    it('EnvoiSMS path posts OTP metadata and logs success without OTP', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENVOISMS_API_KEY = 'smr_test';
      process.env.ENVOISMS_FROM = 'NexaStays';
      delete process.env.SMS_PROVIDER;

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'msg_test' }),
      });
      (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      const service = new SmsService();
      const lines = collectLoggerOutput(service);
      service.onModuleInit();

      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.envoisms.ma/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer smr_test',
          }),
        }),
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(String(init.body));
      expect(body.to).toBe('+212612345678');
      expect(body.channel).toBe('sms');
      expect(body.from).toBe('NexaStays');
      expect(body.metadata).toEqual({ purpose: 'otp' });
      expect(body.message).toContain(OTP);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).toMatch(/SMS sent successfully/);
      expect(joined).toMatch(/envoisms/);
    });

    it('Twilio path logs success without OTP', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SMS_PROVIDER = 'twilio';
      delete process.env.ENVOISMS_API_KEY;

      const service = new SmsService();
      const lines = collectLoggerOutput(service);

      const create = jest.fn().mockResolvedValue({ sid: 'SMtest' });
      (service as unknown as { isConfigured: boolean }).isConfigured = true;
      (service as unknown as { provider: string }).provider = 'twilio';
      (
        service as unknown as {
          twilioClient: { messages: { create: typeof create } };
        }
      ).twilioClient = { messages: { create } };
      (service as unknown as { twilioFromNumber: string }).twilioFromNumber =
        '+15555550100';

      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(true);
      expect(create).toHaveBeenCalled();

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).toMatch(/SMS sent successfully/);
    });

    it('provider failure logs do not include OTP', async () => {
      const service = new SmsService();
      const lines = collectLoggerOutput(service);

      (service as unknown as { isConfigured: boolean }).isConfigured = true;
      (service as unknown as { provider: string }).provider = 'envoisms';
      (service as unknown as { envoiApiKey: string }).envoiApiKey = 'smr_test';
      (service as unknown as { envoiBaseUrl: string }).envoiBaseUrl =
        'https://api.envoisms.ma';

      (globalThis as { fetch: typeof fetch }).fetch = jest
        .fn()
        .mockRejectedValue(new Error(`EnvoiSMS boom includes ${OTP}`)) as unknown as typeof fetch;

      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(false);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).not.toMatch(/verification code is:/i);
    });
  });
});
