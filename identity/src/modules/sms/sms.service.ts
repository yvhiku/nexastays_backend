import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private client: Twilio | null = null;
  private fromNumber: string;
  private isConfigured = false;

  onModuleInit() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    if (accountSid && authToken && this.fromNumber) {
      this.client = new Twilio(accountSid, authToken);
      this.isConfigured = true;
      this.logger.log('Twilio SMS service initialized');
    } else {
      this.logger.warn(
        'Twilio credentials not configured - SMS will be logged only',
      );
    }
  }

  async sendOtp(phoneNumber: string, otpCode: string): Promise<boolean> {
    const message = `Your NexaPay verification code is: ${otpCode}. Valid for 5 minutes. Do not share this code.`;

    if (!this.isConfigured || !this.client) {
      this.logger.warn(
        `[SMS Mock] Would send to ${phoneNumber}: ${message}`,
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
        `SMS sent successfully to ${phoneNumber}, SID: ${result.sid}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send SMS to ${phoneNumber}`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  async sendGenericSms(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      this.logger.warn(
        `[SMS Mock] Would send to ${phoneNumber}: ${message}`,
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
        `SMS sent successfully to ${phoneNumber}, SID: ${result.sid}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send SMS to ${phoneNumber}`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }
}
