import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from '../entities/feature-flag.entity';

const DEFAULTS: Array<{ key: string; enabled: boolean; description: string }> =
  [
    {
      key: 'nexa_go_enabled',
      enabled: false,
      description: 'Enable Nexa Go (rides and delivery)',
    },
    {
      key: 'maintenance_mode',
      enabled: false,
      description: 'Maintenance mode',
    },
    {
      key: 'new_signups_enabled',
      enabled: true,
      description: 'Allow new user signups',
    },
  ];

@Injectable()
export class AdminSystemFeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly repo: Repository<FeatureFlag>,
  ) {}

  async getAll(): Promise<
    Array<{
      name: string;
      key: string;
      enabled: boolean;
      description: string | null;
    }>
  > {
    const stored = await this.repo.find({ order: { key: 'ASC' } });
    const byKey = new Map(stored.map((f) => [f.key, f]));

    const result: Array<{
      name: string;
      key: string;
      enabled: boolean;
      description: string | null;
    }> = [];
    for (const d of DEFAULTS) {
      const row = byKey.get(d.key);
      result.push({
        name: d.key,
        key: d.key,
        enabled: row ? row.enabled : d.enabled,
        description: row?.description ?? d.description,
      });
    }
    for (const row of stored) {
      if (DEFAULTS.some((x) => x.key === row.key)) continue;
      result.push({
        name: row.key,
        key: row.key,
        enabled: row.enabled,
        description: row.description ?? null,
      });
    }
    return result;
  }

  async update(key: string, enabled: boolean) {
    let row = await this.repo.findOne({ where: { key } });
    const defaultRow = DEFAULTS.find((d) => d.key === key);
    if (!row) {
      row = await this.repo.save({
        key,
        enabled,
        description: defaultRow?.description ?? null,
      });
      return {
        key: row.key,
        enabled: row.enabled,
        description: row.description,
      };
    }
    row.enabled = enabled;
    await this.repo.save(row);
    return { key: row.key, enabled: row.enabled, description: row.description };
  }
}
