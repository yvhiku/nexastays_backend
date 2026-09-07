import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { Twilio } from 'twilio';
import type { AlertingService } from '@nexa/telemetry';
import { ObsEvents } from '@nexa/telemetry';
import {
  assertProductionSmsConfigured,
  getEnvoiSmsBaseUrl,
  getEnvoiSmsFrom,
  isEnvoiSmsConfigured,
  isProductionRuntime,
  isTwilioConfigured,
  resolveSmsProvider,
  type SmsProviderName,
} from './sms-config';
import { ALERTING } from '../../common/observability/observability.tokens';

function maskPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function otpMessage(otpCode: string): string {
  return `Your Nexa Stays verification code is: ${otpCode}. Valid for 5 minutes. Do not share this code.`;
}

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private provider: SmsProviderName = 'none';
  private twilioClient: Twilio | null = null;
  private twilioFromNumber = '';
  private envoiApiKey = '';
  private envoiBaseUrl = 'https://api.envoisms.ma';
  private envoiFrom: string | undefined;
  private isConfigured = false;

  constructor(
    @Optional() @Inject(ALERTING) private readonly alerting?: AlertingService,
  ) {}

  onModuleInit() {
    assertProductionSmsConfigured();

    this.provider = resolveSmsProvider();

    if (this.provider === 'envoisms' && isEnvoiSmsConfigured()) {
      this.envoiApiKey = process.env.ENVOISMS_API_KEY!.trim();
      this.envoiBaseUrl = getEnvoiSmsBaseUrl();
      this.envoiFrom = getEnvoiSmsFrom();
      this.isConfigured = true;
      this.logger.log(
        `EnvoiSMS service initialized (${this.envoiBaseUrl}${this.envoiFrom ? `, from=${this.envoiFrom}` : ''})`,
      );
      return;
    }

    if (this.provider === 'twilio' && isTwilioConfigured()) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
      const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
      this.twilioFromNumber = process.env.TWILIO_PHONE_NUMBER!.trim();
      this.twilioClient = new Twilio(accountSid, authToken);
      this.isConfigured = true;
      this.logger.log('Twilio SMS service initialized');
      return;
    }

    this.logger.warn(
      'SMS provider not configured — OTP SMS delivery suppressed in non-production (OTP values are never logged)',
    );
  }

  async sendOtp(phoneNumber: string, otpCode: string): Promise<boolean> {
    return this.dispatch(phoneNumber, otpMessage(otpCode), true);
  }

  async sendGenericSms(phoneNumber: string, message: string): Promise<boolean> {
    return this.dispatch(phoneNumber, message, false);
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  private async dispatch(
    phoneNumber: string,
    message: string,
    isOtp: boolean,
  ): Promise<boolean> {
    const masked = maskPhone(phoneNumber);

    if (!this.isConfigured) {
      if (isProductionRuntime()) {
        this.logger.error(
          `SMS provider not configured in production — refusing ${isOtp ? 'OTP ' : ''}delivery (${masked})`,
        );
        return false;
      }
      this.logger.warn(
        `[SMS Mock] ${isOtp ? 'OTP' : 'Generic SMS'} delivery suppressed in non-production for ${masked}`,
      );
      return true;
    }

    try {
      if (this.provider === 'envoisms') {
        const id = await this.sendViaEnvoiSms(phoneNumber, message, isOtp);
        this.logger.log(
          `SMS sent successfully to ${masked}${id ? `, id: ${id}` : ''} (envoisms)`,
        );
        return true;
      }

      if (this.provider === 'twilio' && this.twilioClient) {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: this.twilioFromNumber,
          to: phoneNumber,
        });
        this.logger.log(
          `SMS sent successfully to ${masked}, SID: ${result.sid} (twilio)`,
        );
        return true;
      }

      this.logger.error(
        `SMS provider "${this.provider}" is not ready (${masked})`,
      );
      return false;
    } catch {
      // Never log provider error bodies — they may echo message content/OTP.
      this.logger.error(`Failed to send SMS to ${masked}`);
      if (isOtp) {
        void this.alerting?.alert({
          key: ObsEvents.AUTH_OTP_PROVIDER_FAILURE,
          severity: 'P1',
          message: 'OTP SMS provider failure',
          fingerprint: 'auth:otp:provider',
          context: { phone_masked: masked, provider: this.provider },
        });
      }
      return false;
    }
  }

  /**
   * Deliver Nexa-generated OTP via EnvoiSMS POST /v1/messages.
   * We keep generating/verifying codes in Identity; EnvoiSMS's /v1/verify
   * would own a different code and break auth.service verifyOtp.
   * Docs: https://envoisms.ma/en/docs/
   */
  private async sendViaEnvoiSms(
    phoneNumber: string,
    message: string,
    isOtp: boolean,
  ): Promise<string | undefined> {
    const body: Record<string, unknown> = {
      to: phoneNumber,
      message,
      channel: 'sms',
    };
    if (this.envoiFrom) {
      body.from = this.envoiFrom;
    }
    if (isOtp) {
      body.metadata = { purpose: 'otp' };
    }

    const res = await fetch(`${this.envoiBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.envoiApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Drain body without logging — may contain echoed content.
      await res.text().catch(() => undefined);
      throw new Error(`EnvoiSMS HTTP ${res.status}`);
    }

    const payload = (await res.json().catch(() => null)) as {
      id?: string;
    } | null;
    return payload?.id;
  }
}
