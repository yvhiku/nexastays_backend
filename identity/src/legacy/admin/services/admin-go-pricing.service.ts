import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoPricingConfig } from '../../go-taxi/pricing/entities/go-pricing-config.entity';
import { GoPricingConfigAudit } from '../../go-taxi/pricing/entities/go-pricing-config-audit.entity';
import { GoPricingService } from '../../go-taxi/pricing/go-pricing.service';

const EDITABLE_FIELDS = [
  'base_fare',
  'per_km_rate',
  'per_min_rate',
  'min_fare',
  'booking_fee',
  'commission_type',
  'commission_rate',
  'commission_min',
  'cancellation_window_secs',
  'cancellation_fee',
  'surge_multiplier',
  'surge_active',
  'is_active',
] as const;

@Injectable()
export class AdminGoPricingService {
  constructor(
    @InjectRepository(GoPricingConfig)
    private readonly configRepo: Repository<GoPricingConfig>,
    @InjectRepository(GoPricingConfigAudit)
    private readonly auditRepo: Repository<GoPricingConfigAudit>,
    private readonly goPricingService: GoPricingService,
  ) {}

  async getAll() {
    const rows = await this.configRepo.find({
      order: { vehicle_type: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getOne(vehicleType: string) {
    const row = await this.configRepo.findOne({
      where: { vehicle_type: vehicleType.toLowerCase() },
    });
    if (!row) {
      throw new NotFoundException(`Pricing config not found: ${vehicleType}`);
    }
    return this.toDto(row);
  }

  async update(
    vehicleType: string,
    body: Record<string, unknown>,
    changedBy: string,
  ) {
    const normalizedType = vehicleType.toLowerCase();
    const config = await this.configRepo.findOne({
      where: { vehicle_type: normalizedType },
    });
    if (!config) {
      throw new NotFoundException(`Pricing config not found: ${vehicleType}`);
    }

    const updates: Partial<GoPricingConfig> = {};
    const auditEntries: Array<{
      config_id: string;
      vehicle_type: string;
      changed_by: string;
      changed_at: Date;
      field_name: string;
      old_value: string | null;
      new_value: string | null;
    }> = [];

    for (const key of EDITABLE_FIELDS) {
      const raw = body[key];
      if (raw === undefined) continue;

      const oldVal = (config as unknown as Record<string, unknown>)[key];
      let newVal: string | number | boolean | null = null;

      if (key === 'surge_active' || key === 'is_active') {
        newVal = Boolean(raw);
      } else if (
        key === 'cancellation_window_secs' ||
        key === 'commission_rate' ||
        key === 'commission_min'
      ) {
        newVal = Number(raw);
      } else if (
        [
          'base_fare',
          'per_km_rate',
          'per_min_rate',
          'min_fare',
          'booking_fee',
          'cancellation_fee',
          'surge_multiplier',
        ].includes(key)
      ) {
        newVal = Number(raw);
      } else if (key === 'commission_type') {
        newVal = String(raw);
      } else {
        newVal = raw as string | number | boolean | null;
      }

      (updates as Record<string, unknown>)[key] = newVal;
      auditEntries.push({
        config_id: config.id,
        vehicle_type: normalizedType,
        changed_by: changedBy,
        changed_at: new Date(),
        field_name: key,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null,
      });
    }

    if (Object.keys(updates).length === 0) {
      return this.toDto(config);
    }

    Object.assign(config, updates);
    config.updated_at = new Date();
    await this.configRepo.save(config);

    await this.auditRepo.save(
      auditEntries.map((e) => this.auditRepo.create(e)),
    );

    await this.goPricingService.invalidateConfigCache(normalizedType);
    return this.toDto(config);
  }

  async setSurge(
    vehicleType: string,
    surgeActive: boolean,
    surgeMultiplier?: number,
  ) {
    const normalizedType = vehicleType.toLowerCase();
    const config = await this.configRepo.findOne({
      where: { vehicle_type: normalizedType },
    });
    if (!config) {
      throw new NotFoundException(`Pricing config not found: ${vehicleType}`);
    }

    const oldActive = config.surge_active;
    const oldMultiplier = config.surge_multiplier;
    config.surge_active = surgeActive;
    if (surgeMultiplier != null) {
      config.surge_multiplier = surgeMultiplier;
    }
    config.updated_at = new Date();
    await this.configRepo.save(config);

    await this.auditRepo.save([
      this.auditRepo.create({
        config_id: config.id,
        vehicle_type: normalizedType,
        changed_by: 'admin',
        changed_at: new Date(),
        field_name: 'surge_active',
        old_value: String(oldActive),
        new_value: String(surgeActive),
      }),
      ...(surgeMultiplier != null
        ? [
            this.auditRepo.create({
              config_id: config.id,
              vehicle_type: normalizedType,
              changed_by: 'admin',
              changed_at: new Date(),
              field_name: 'surge_multiplier',
              old_value: String(oldMultiplier),
              new_value: String(surgeMultiplier),
            }),
          ]
        : []),
    ]);

    await this.goPricingService.invalidateConfigCache(normalizedType);
    return this.toDto(config);
  }

  async getHistory() {
    const rows = await this.auditRepo.find({
      order: { changed_at: 'DESC' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      vehicle_type: r.vehicle_type,
      changed_by: r.changed_by,
      changed_at: r.changed_at,
      field_name: r.field_name,
      old_value: r.old_value,
      new_value: r.new_value,
    }));
  }

  private toDto(row: GoPricingConfig) {
    return {
      id: row.id,
      vehicle_type: row.vehicle_type,
      base_fare: Number(row.base_fare),
      per_km_rate: Number(row.per_km_rate),
      per_min_rate: Number(row.per_min_rate),
      min_fare: Number(row.min_fare),
      booking_fee: Number(row.booking_fee),
      commission_type: row.commission_type,
      commission_rate: row.commission_rate != null ? Number(row.commission_rate) : null,
      commission_min: Number(row.commission_min),
      cancellation_window_secs: row.cancellation_window_secs,
      cancellation_fee: Number(row.cancellation_fee),
      surge_multiplier: Number(row.surge_multiplier),
      surge_active: row.surge_active,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
