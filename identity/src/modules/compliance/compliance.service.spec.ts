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

  it('does not downgrade VERIFIED user.kyc_status when minting Sumsub SDK tokens', async () => {
    const verifiedUser = {
      ...mockUser,
      kyc_status: 'VERIFIED',
    } as User;
    mockUserRepo.findOne.mockResolvedValue(verifiedUser);
    mockKycRepo.findOne.mockResolvedValue({
      user_id: verifiedUser.id,
      status: 'VERIFIED',
      source: 'STAYS',
    });
    jest.spyOn(service as any, 'sumsubRequest').mockResolvedValue({
      token: 'sumsub-token',
      userId: `STAYS_${verifiedUser.id}`,
    });

    await service.createSumsubSdkToken(verifiedUser.id, 'STAYS');

    expect(mockUserRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kyc_status: 'VERIFIED' }),
    );
  });

  describe('Sumsub DOB persistence (S2-02)', () => {
    beforeEach(() => {
      mockUserRepo.manager = { query: jest.fn().mockResolvedValue([]) };
    });

    it('persists provider DOB onto KYC + user when Sumsub info.dob is present', async () => {
      const user = {
        ...mockUser,
        date_of_birth: null,
        kyc_status: 'PENDING',
        nationality: 'MA',
        document_country: undefined,
        unified_identity_id: null,
        profile_locked_at: null,
      } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockKycRepo.findOne.mockResolvedValue({
        user_id: user.id,
        status: 'PENDING',
        source: 'STAYS',
        provider: 'SUMSUB',
        document_country: 'MA',
        date_of_birth: null,
        full_name: null,
        email: null,
      });

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-1',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
        providerDateOfBirth: '1991-07-04',
      });

      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          date_of_birth: '1991-07-04',
          status: 'VERIFIED',
        }),
      );
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          date_of_birth: new Date('1991-07-04T00:00:00.000Z'),
        }),
      );
    });

    it('leaves DOB empty when Sumsub provides no DOB', async () => {
      const user = {
        ...mockUser,
        date_of_birth: null,
        kyc_status: 'PENDING',
        nationality: 'MA',
        profile_locked_at: null,
        unified_identity_id: null,
      } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockKycRepo.findOne.mockResolvedValue({
        user_id: user.id,
        status: 'PENDING',
        source: 'STAYS',
        provider: 'SUMSUB',
        document_country: 'MA',
        date_of_birth: null,
        full_name: null,
        email: null,
      });
      jest.spyOn(service as any, 'sumsubRequest').mockRejectedValue(
        new Error('no applicant'),
      );

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-missing-dob',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
        providerDateOfBirth: null,
      });

      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ date_of_birth: null }),
      );
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ date_of_birth: null }),
      );
    });

    it('does not overwrite an existing KYC DOB from webhook payload', async () => {
      const user = {
        ...mockUser,
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        kyc_status: 'VERIFIED',
        nationality: 'MA',
        unified_identity_id: null,
      } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockKycRepo.findOne.mockResolvedValue({
        user_id: user.id,
        status: 'VERIFIED',
        source: 'STAYS',
        provider: 'SUMSUB',
        document_country: 'MA',
        date_of_birth: '1990-01-01',
        full_name: null,
        email: null,
      });
      const fetchSpy = jest.spyOn(service as any, 'sumsubRequest');

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-1',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
        providerDateOfBirth: '1999-12-31',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ date_of_birth: '1990-01-01' }),
      );
    });
  });
});
