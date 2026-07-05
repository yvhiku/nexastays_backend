import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysPlatformSettings } from './stays-platform-settings.entity';

export type FeeRates = {
  guest_fee_pct: number;
  host_fee_pct: number;
  guest_fee_percent: number;
  host_fee_percent: number;
  total_commission_percent: number;
};

function envPct(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_GUEST = envPct('STAYS_GUEST_FEE_PCT', 0.05);
const DEFAULT_HOST = envPct('STAYS_HOST_FEE_PCT', 0.05);

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private cached: FeeRates | null = null;

  constructor(
    @InjectRepository(StaysPlatformSettings)
    private readonly settingsRepo: Repository<StaysPlatformSettings>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRow();
    await this.refreshCache();
  }

  private toRates(guest: number, host: number): FeeRates {
    const guestPct = Number(guest);
    const hostPct = Number(host);
    return {
      guest_fee_pct: guestPct,
      host_fee_pct: hostPct,
      guest_fee_percent: Math.round(guestPct * 1000) / 10,
      host_fee_percent: Math.round(hostPct * 1000) / 10,
      total_commission_percent:
        Math.round((guestPct + hostPct) * 1000) / 10,
    };
  }

  private async ensureRow(): Promise<void> {
    const existing = await this.settingsRepo.findOne({ where: { id: 1 } });
    if (existing) return;
    await this.settingsRepo.save(
      this.settingsRepo.create({
        id: 1,
        guest_fee_pct: DEFAULT_GUEST,
        host_fee_pct: DEFAULT_HOST,
      }),
    );
  }

  async refreshCache(): Promise<FeeRates> {
    await this.ensureRow();
    const row = await this.settingsRepo.findOneOrFail({ where: { id: 1 } });
    this.cached = this.toRates(row.guest_fee_pct, row.host_fee_pct);
    return this.cached;
  }

  getFeeRates(): FeeRates {
    if (this.cached) return this.cached;
    return this.toRates(DEFAULT_GUEST, DEFAULT_HOST);
  }

  async getFeeRatesAsync(): Promise<FeeRates> {
    if (this.cached) return this.cached;
    return this.refreshCache();
  }

  calculateFees(subtotal: number): {
    guestFee: number;
    hostFee: number;
    totalPaid: number;
    payoutAmount: number;
  } {
    const { guest_fee_pct, host_fee_pct } = this.getFeeRates();
    const guestFee = Math.round(subtotal * guest_fee_pct * 100) / 100;
    const hostFee = Math.round(subtotal * host_fee_pct * 100) / 100;
    return {
      guestFee,
      hostFee,
      totalPaid: subtotal + guestFee,
      payoutAmount: subtotal - hostFee,
    };
  }

  async updateFeeRates(
    guestFeePct: number,
    hostFeePct: number,
    updatedBy?: string,
  ): Promise<FeeRates> {
    await this.ensureRow();
    await this.settingsRepo.update(
      { id: 1 },
      {
        guest_fee_pct: guestFeePct,
        host_fee_pct: hostFeePct,
        updated_by: updatedBy ?? null,
      },
    );
    return this.refreshCache();
  }
}
