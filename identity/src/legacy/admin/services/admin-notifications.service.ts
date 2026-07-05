import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { RiskAlert } from '../entities/risk-alert.entity';
import { StaysHostProfile } from '../../stays/entities/stays-host-profile.entity';

@Injectable()
export class AdminNotificationsService {
  constructor(
    @InjectRepository(KycProfile)
    private readonly kycRepo: Repository<KycProfile>,
    @InjectRepository(RiskAlert)
    private readonly riskRepo: Repository<RiskAlert>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
  ) {}

  async getSummary() {
    const [pendingKyc, openRiskAlerts, pendingHostApplications] = await Promise.all([
      this.kycRepo.count({ where: { status: 'PENDING' } }),
      this.riskRepo.count({ where: { status: 'OPEN' } }),
      this.hostProfileRepo.count({
        where: { application_status: 'PENDING' },
      }),
    ]);

    return {
      pendingKyc,
      openRiskAlerts,
      pendingHostApplications,
      total:
        Number(pendingKyc ?? 0) +
        Number(openRiskAlerts ?? 0) +
        Number(pendingHostApplications ?? 0),
    };
  }
}

