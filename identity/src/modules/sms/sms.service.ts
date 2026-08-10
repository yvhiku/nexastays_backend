import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Twilio } from 'twilio';
import {
  assertProductionSmsConfigured,
  isProductionRuntime,
  isTwilioConfigured,
} from './sms-config';

function maskPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private client: Twilio | null = null;
  private fromNumber: string;
  private isConfigured = false;

  onModuleInit() {
    // Belt-and-suspenders: production must never start without SMS provider.
    assertProductionSmsConfigured();

    if (isTwilioConfigured()) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
      const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER!.trim();
      this.client = new Twilio(accountSid, authToken);
      this.isConfigured = true;
      this.logger.log('Twilio SMS service initialized');
      return;
    }

    // Non-production only — production already threw above.
    this.fromNumber = '';
    this.logger.warn(
      'Twilio credentials not configured — OTP SMS delivery suppressed in non-production (OTP values are never logged)',
    );
  }

  async sendOtp(phoneNumber: string, otpCode: string): Promise<boolean> {
    const message = `Your NexaPay verification code is: ${otpCode}. Valid for 5 minutes. Do not share this code.`;
    const masked = maskPhone(phoneNumber);

    if (!this.isConfigured || !this.client) {
      if (isProductionRuntime()) {
        this.logger.error(
          `SMS provider not configured in production — refusing OTP delivery (${masked})`,
        );
        return false;
      }
      this.logger.warn(
        `[SMS Mock] OTP delivery suppressed in non-production for ${masked}`,
      );
      return true;
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      this.logger.log(
        `SMS sent successfully to ${masked}, SID: ${result.sid}`,
      );
      return true;
    } catch {
      // Never log provider error bodies — they may echo message content/OTP.
      this.logger.error(`Failed to send SMS to ${masked}`);
      return false;
    }
  }

  async sendGenericSms(phoneNumber: string, message: string): Promise<boolean> {
    const masked = maskPhone(phoneNumber);

    if (!this.isConfigured || !this.client) {
      if (isProductionRuntime()) {
        this.logger.error(
          `SMS provider not configured in production — refusing SMS (${masked})`,
        );
        return false;
      }
      this.logger.warn(
        `[SMS Mock] Generic SMS delivery suppressed in non-production for ${masked}`,
      );
      return true;
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      this.logger.log(
        `SMS sent successfully to ${masked}, SID: ${result.sid}`,
      );
      return true;
    } catch {
      this.logger.error(`Failed to send SMS to ${masked}`);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }
}
