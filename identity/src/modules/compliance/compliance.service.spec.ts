import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceService } from './compliance.service';
import { KycProfile } from './entities/kyc-profile.entity';
import { User } from '../users/entities/user.entity';
import { SubmitKycDto } from './dto/submit-kyc.dto';

describe('ComplianceService (KYC source)', () => {
  let service: ComplianceService;
  let kycRepo: Repository<KycProfile>;
  let userRepo: Repository<User>;

  const mockUser = {
    id: 'user-123',
    phone_number: '+212612345678',
    full_name: 'Test User',
    kyc_status: 'PENDING',
    pin_hash: 'hash',
    status: 'ACTIVE',
    risk_score: 0,
    updated_at: new Date(),
  } as User;

  const mockKycRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserRepo.findOne.mockResolvedValue(mockUser);
    mockKycRepo.findOne.mockResolvedValue(null);
    mockKycRepo.create.mockImplementation((dto) => ({ ...dto, user_id: mockUser.id }));
    mockKycRepo.save.mockImplementation((entity) => Promise.resolve({ ...entity }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: getRepositoryToken(KycProfile), useValue: mockKycRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    kycRepo = module.get(getRepositoryToken(KycProfile));
  });

  it('saves kyc_source from body when source=STAYS', async () => {
    const dto: SubmitKycDto = {
      phone_number: '+212612345678',
      documents: { id_document: true, selfie: true },
      source: 'STAYS',
      document_country: 'MA',
    };

    await service.submitKyc('user-123', dto);

    expect(mockKycRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'STAYS',
        user_id: 'user-123',
      }),
    );
  });

  it('saves kyc_source from body when source=GO', async () => {
    const dto: SubmitKycDto = {
      phone_number: '+212612345678',
      documents: { id_document: true },
      source: 'GO',
      document_country: 'MA',
    };

    await service.submitKyc('user-123', dto);

    expect(mockKycRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'GO',
      }),
    );
  });

  it('saves kyc_source=PAY when source=PAY in body', async () => {
    const dto: SubmitKycDto = {
      phone_number: '+212612345678',
      source: 'PAY',
      document_country: 'MA',
    };

    await service.submitKyc('user-123', dto);

    expect(mockKycRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'PAY',
      }),
    );
  });

  it('defaults to PAY when source is invalid or missing', async () => {
    const dto: SubmitKycDto = {
      phone_number: '+212612345678',
      source: 'INVALID',
      document_country: 'MA',
    };

    await service.submitKyc('user-123', dto);

    expect(mockKycRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'PAY',
      }),
    );
  });

  it('derives document_country from nationality when omitted', async () => {
    const dto: SubmitKycDto = {
      phone_number: '+212612345678',
      nationality: 'MA',
      source: 'STAYS',
    };

    await service.submitKyc('user-123', dto);

    expect(mockKycRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        document_country: 'MA',
        source: 'STAYS',
      }),
    );
  });
});
