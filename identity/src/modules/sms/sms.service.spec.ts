import { Logger } from '@nestjs/common';
import { assertProductionSmsConfigured } from './sms-config';
import { SmsService } from './sms.service';

describe('SEC-002 SMS / OTP logging', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('assertProductionSmsConfigured', () => {
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

    it('fails closed in production when Twilio is missing', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'production',
        }),
      ).toThrow(/TWILIO_ACCOUNT_SID/);
    });

    it('does not require Twilio outside production', () => {
      expect(() =>
        assertProductionSmsConfigured({
          NODE_ENV: 'development',
        }),
      ).not.toThrow();
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
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

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
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      const service = new SmsService();
      // Bypass boot throw to exercise runtime fail-closed path.
      (service as unknown as { isConfigured: boolean }).isConfigured = false;
      (service as unknown as { client: null }).client = null;

      const lines = collectLoggerOutput(service);
      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(false);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).not.toMatch(/verification code is:/i);
      expect(joined).toMatch(/refusing OTP delivery/i);
    });

    it('configured provider path logs success without OTP', async () => {
      process.env.NODE_ENV = 'development';
      const service = new SmsService();
      const lines = collectLoggerOutput(service);

      const create = jest.fn().mockResolvedValue({ sid: 'SMtest' });
      (service as unknown as { isConfigured: boolean }).isConfigured = true;
      (service as unknown as { client: { messages: { create: typeof create } } }).client =
        { messages: { create } };
      (service as unknown as { fromNumber: string }).fromNumber = '+15555550100';

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

      const create = jest
        .fn()
        .mockRejectedValue(new Error(`Twilio boom includes ${OTP}`));
      (service as unknown as { isConfigured: boolean }).isConfigured = true;
      (service as unknown as { client: { messages: { create: typeof create } } }).client =
        { messages: { create } };
      (service as unknown as { fromNumber: string }).fromNumber = '+15555550100';

      const ok = await service.sendOtp('+212612345678', OTP);
      expect(ok).toBe(false);

      const joined = lines.join('\n');
      expect(joined).not.toContain(OTP);
      expect(joined).not.toMatch(/verification code is:/i);
    });
  });
});