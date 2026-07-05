import { Injectable } from '@nestjs/common';

export interface PayConfigDto {
  dailyLimitUnverified: number;
  dailyLimitKyc: number;
  qrExpirySeconds: number;
}

const DEFAULTS: PayConfigDto = {
  dailyLimitUnverified: 5000,
  dailyLimitKyc: 50000,
  qrExpirySeconds: 300,
};

@Injectable()
export class AdminPayConfigService {
  private overrides: Partial<PayConfigDto> = {};

  getPayConfig(): PayConfigDto {
    return { ...DEFAULTS, ...this.overrides };
  }

  updatePayConfig(body: Partial<PayConfigDto>): PayConfigDto {
    if (typeof body.dailyLimitUnverified === 'number')
      this.overrides.dailyLimitUnverified = body.dailyLimitUnverified;
    if (typeof body.dailyLimitKyc === 'number')
      this.overrides.dailyLimitKyc = body.dailyLimitKyc;
    if (typeof body.qrExpirySeconds === 'number')
      this.overrides.qrExpirySeconds = body.qrExpirySeconds;
    return this.getPayConfig();
  }
}
