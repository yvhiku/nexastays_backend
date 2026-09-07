import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminKycService } from './admin-kyc.service';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { User } from '../../users/entities/user.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminKycQueryDto } from '../dto/admin-kyc.query.dto';
import { KycReuseService } from '../../users/kyc-reuse.service';
import { IdentitySnapshotService } from '../../identity-snapshot/identity-snapshot.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { ComplianceService } from '../../compliance/compliance.service';

describe('AdminKycService (source filtering)', () => {
  let service: AdminKycService;

  const mockRows = [
    {
      id: 'kyc-1',
      user_id: 'user-1',
      user_phone: '+212611111111',
      user_name: 'User One',
      status: 'PENDING',
      source: 'PAY',
      submitted_at: new Date(),
    },
    {
      id: 'kyc-2',
      user_id: 'user-2',
      user_phone: '+212622222222',
      user_name: 'User Two',
      status: 'PENDING',
      source: 'STAYS',
      submitted_at: new Date(),
    },
    {
      id: 'kyc-3',
      user_id: 'user-3',
      user_phone: '+212633333333',
      user_name: 'User Three',
      status: 'PENDING',
      source: 'GO',
      submitted_at: new Date(),
    },
  ];

  const mockQueryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(mockRows),
  };

  const mockKycRepo = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockUserRepo = {};
  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };
  const mockKycReuse = {};
  const mockSnapshot = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const mockDomainEvents = {};
  const mockCompliance = {
    syncSumsubStatus: jest.fn(),
    syncSumsubDossier: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQueryBuilder.getRawMany.mockResolvedValue(mockRows);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminKycService,
        { provide: getRepositoryToken(KycProfile), useValue: mockKycRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AdminAuditService, useValue: mockAuditService },
        { provide: KycReuseService, useValue: mockKycReuse },
        { provide: IdentitySnapshotService, useValue: mockSnapshot },
        { provide: DomainEventsService, useValue: mockDomainEvents },
        { provide: ComplianceService, useValue: mockCompliance },
      ],
    }).compile();

    service = module.get<AdminKycService>(AdminKycService);
  });

  it('filters by source=PAY (includes legacy null)', async () => {
    await service.getQueue({ source: 'PAY' } as AdminKycQueryDto);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(k.source IS NULL OR k.source = :source)',
      { source: 'PAY' },
    );
  });

  it('filters by source=STAYS (exact match only, no legacy null)', async () => {
    await service.getQueue({ source: 'STAYS' } as AdminKycQueryDto);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'k.source = :source',
      { source: 'STAYS' },
    );
  });

  it('filters by source=GO', async () => {
    await service.getQueue({ source: 'GO' } as AdminKycQueryDto);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'k.source = :source',
      { source: 'GO' },
    );
  });

  it('defaults to ALL sources when source is missing', async () => {
    await service.getQueue({} as AdminKycQueryDto);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(k.source IS NULL OR k.source = :pay OR k.source = :go OR k.source = :stays)',
      { pay: 'PAY', go: 'GO', stays: 'STAYS' },
    );
  });

  it('rejects an invalid source value', async () => {
    await expect(
      service.getQueue({ source: 'INVALID' } as AdminKycQueryDto),
    ).rejects.toThrow(/source must be one of/);
  });

  it('applies pagination when page and limit provided', async () => {
    await service.getQueue({
      source: 'PAY',
      page: 2,
      limit: 10,
    } as AdminKycQueryDto);

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });
});
