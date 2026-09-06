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

  const mockUserRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    manager?: { query: jest.Mock };
  } = {
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

  describe('Sumsub full identity backfill (admin KYC monitoring)', () => {
    const applicant = {
      id: 'applicant-1',
      externalUserId: 'STAYS_user-123',
      info: {
        firstName: 'Mohamed',
        lastName: 'Fikri',
        dob: '1991-07-04',
        nationality: 'MAR',
        country: 'MAR',
        idDocs: [
          { idDocType: 'ID_CARD', country: 'MAR', number: 'AB123456' },
          { idDocType: 'SELFIE', country: 'MAR' },
        ],
      },
    };

    beforeEach(() => {
      mockUserRepo.manager = { query: jest.fn().mockResolvedValue([]) };
    });

    it('extractSumsubIdentity maps name / DOB / alpha-3 country / ID_CARD→CNIE / doc number', () => {
      expect(service.extractSumsubIdentity(applicant)).toEqual({
        dateOfBirth: '1991-07-04',
        fullName: 'Mohamed Fikri',
        nationality: 'MA',
        documentType: 'CNIE',
        documentCountry: 'MA',
        documentNumber: 'AB123456',
        documentValidUntil: null,
        email: null,
        phone: null,
        levelName: null,
        reviewStatus: null,
        reviewAnswer: null,
        attemptCnt: null,
        inspectionId: null,
      });
    });

    it('extractSumsubIdentity never invents values', () => {
      expect(service.extractSumsubIdentity({ id: 'x' })).toEqual({
        dateOfBirth: null,
        fullName: null,
        nationality: null,
        documentType: null,
        documentCountry: null,
        documentNumber: null,
        documentValidUntil: null,
        email: null,
        phone: null,
        levelName: null,
        reviewStatus: null,
        reviewAnswer: null,
        attemptCnt: null,
        inspectionId: null,
      });
      expect(service.extractSumsubIdentity(null)).toMatchObject({ fullName: null });
    });

    it('extractSumsubIdentity picks expiry, email, phone, and review meta', () => {
      expect(
        service.extractSumsubIdentity({
          id: 'abc123abc123abc123abc123',
          email: 'a@example.com',
          phone: '+212600000000',
          inspectionId: 'insp-9',
          review: {
            levelName: 'basic-kyc-level',
            reviewStatus: 'completed',
            attemptCnt: 2,
            reviewResult: { reviewAnswer: 'GREEN' },
          },
          info: {
            firstName: 'John',
            lastName: 'Mock-Doe',
            dob: '1990-01-15',
            nationality: 'USA',
            idDocs: [
              {
                idDocType: 'PASSPORT',
                country: 'USA',
                number: 'P1234567',
                validUntil: '2030-12-31',
              },
            ],
          },
        }),
      ).toEqual(
        expect.objectContaining({
          fullName: 'John Mock-Doe',
          documentType: 'PASSPORT',
          documentCountry: 'US',
          documentNumber: 'P1234567',
          documentValidUntil: '2030-12-31',
          email: 'a@example.com',
          phone: '+212600000000',
          levelName: 'basic-kyc-level',
          reviewStatus: 'completed',
          reviewAnswer: 'GREEN',
          attemptCnt: 2,
          inspectionId: 'insp-9',
        }),
      );
    });

    it('extractSumsubIdentity ignores issuedDate as expiry', () => {
      expect(
        service.extractSumsubIdentity({
          info: {
            idDocs: [
              {
                idDocType: 'PASSPORT',
                country: 'USA',
                number: 'P1',
                issuedDate: '2015-01-01',
              },
            ],
          },
        }).documentValidUntil,
      ).toBeNull();
    });

    it('maps non-Moroccan ID_CARD to NATIONAL_ID and DRIVERS to DRIVING_LICENSE', () => {
      expect(
        service.extractSumsubIdentity({
          info: { idDocs: [{ idDocType: 'ID_CARD', country: 'FRA' }] },
        }).documentType,
      ).toBe('NATIONAL_ID');
      expect(
        service.extractSumsubIdentity({
          info: { idDocs: [{ idDocType: 'DRIVERS', country: 'MAR' }] },
        }).documentType,
      ).toBe('DRIVING_LICENSE');
    });

    it('applyDocsStatusAndMedia stores Sumsub image paths and checklist flags', async () => {
      const persistSpy = jest
        .spyOn(service as any, 'persistProviderImage')
        .mockImplementation(
          async (_uid: string, _aid: string, _imageId: string, basename: string) => {
            return `user-123/${basename}.jpg`;
          },
        );

      const kyc = {
        user_id: 'user-123',
        documents: {},
        document_front_url: null as string | null,
        document_back_url: null as string | null,
        selfie_url: null as string | null,
        id_document_url: null as string | null,
      };

      await (service as any).applyDocsStatusAndMedia(kyc, 'applicant-hex', {
        IDENTITY: {
          reviewResult: { reviewAnswer: 'GREEN' },
          imageIds: ['img-front', 'img-back'],
        },
        SELFIE: {
          reviewResult: { reviewAnswer: 'GREEN' },
          imageIds: ['img-selfie'],
        },
        PHONE_VERIFICATION: {
          reviewResult: { reviewAnswer: 'GREEN' },
        },
      });

      expect(kyc.documents).toEqual(
        expect.objectContaining({
          id_document: true,
          selfie: true,
          liveness: true,
          phone: true,
        }),
      );
      expect(kyc.document_front_url).toBe('user-123/sumsub_doc_front.jpg');
      expect(kyc.document_back_url).toBe('user-123/sumsub_doc_back.jpg');
      expect(kyc.selfie_url).toBe('user-123/sumsub_selfie.jpg');
      expect(kyc.id_document_url).toBe('user-123/sumsub_doc_front.jpg');
      expect(persistSpy).toHaveBeenCalledTimes(3);
      persistSpy.mockRestore();
    });

    it('buildProviderSnapshot omits image binaries and keeps meta ids', () => {
      const snap = (service as any).buildProviderSnapshot(
        {
          id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          email: 'x@y.z',
          inspectionId: 'insp',
          review: {
            levelName: 'basic-kyc-level',
            reviewStatus: 'completed',
            attemptCnt: 1,
            reviewResult: { reviewAnswer: 'GREEN' },
          },
          info: {
            firstName: 'A',
            lastName: 'B',
            idDocs: [{ idDocType: 'PASSPORT', number: 'P1', country: 'USA' }],
          },
        },
        {
          IDENTITY: { imageIds: ['i1'], reviewResult: { reviewAnswer: 'GREEN' } },
          SELFIE: { imageIds: ['i2'], reviewResult: { reviewAnswer: 'GREEN' } },
        },
        { reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } },
      );
      const serialized = JSON.stringify(snap);
      expect(serialized).toContain('i1');
      expect(serialized).not.toMatch(/\\"buffer\\"|data:image/);
      expect(snap).toEqual(
        expect.objectContaining({
          applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          inspectionId: 'insp',
          levelName: 'basic-kyc-level',
        }),
      );
      expect(serialized).not.toContain('P1');
    });

    it('GREEN webhook with applicant fills empty KYC + user identity fields and hashes the doc number', async () => {
      const user = {
        ...mockUser,
        full_name: null,
        date_of_birth: null,
        nationality: null,
        kyc_status: 'PENDING',
        unified_identity_id: null,
        profile_locked_at: null,
      } as unknown as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockKycRepo.findOne.mockResolvedValue({
        user_id: user.id,
        status: 'PENDING',
        source: 'STAYS',
        provider: 'SUMSUB',
        date_of_birth: null,
        full_name: null,
        nationality: null,
        document_type: null,
        document_country: null,
        national_id_number_extracted: null,
        national_id_number_hash: null,
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
        providerApplicant: applicant,
      });

      // Payload already had identity → no extra Sumsub round-trip.
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'VERIFIED',
          full_name: 'Mohamed Fikri',
          date_of_birth: '1991-07-04',
          nationality: 'MA',
          document_type: 'CNIE',
          document_country: 'MA',
          national_id_number_extracted: 'AB123456',
          national_id_number_hash: expect.any(String),
        }),
      );
      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Mohamed Fikri',
          nationality: 'MA',
          date_of_birth: new Date('1991-07-04T00:00:00.000Z'),
        }),
      );
    });

    it('does not clobber form-provided name / document type with provider values', async () => {
      const user = {
        ...mockUser,
        full_name: 'Form Name',
        nationality: 'MA',
        date_of_birth: null,
        kyc_status: 'PENDING',
        unified_identity_id: null,
        profile_locked_at: null,
      } as unknown as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockKycRepo.findOne.mockResolvedValue({
        user_id: user.id,
        status: 'PENDING',
        source: 'STAYS',
        provider: 'SUMSUB',
        date_of_birth: null,
        full_name: 'Form Name',
        nationality: 'MA',
        document_type: 'PASSPORT',
        document_country: 'MA',
        national_id_number_extracted: null,
        national_id_number_hash: null,
        email: null,
      });
      jest.spyOn(service as any, 'sumsubRequest').mockResolvedValue(applicant);

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-1',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
        providerApplicant: applicant,
      });

      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Form Name',
          document_type: 'PASSPORT',
          // Empty fields are still backfilled.
          date_of_birth: '1991-07-04',
          national_id_number_extracted: 'AB123456',
        }),
      );
    });

    it('fetches applicant when webhook payload only has review meta (levelName/inspectionId)', async () => {
      const user = {
        ...mockUser,
        date_of_birth: null,
        nationality: 'MA',
        kyc_status: 'PENDING',
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
      const fetchSpy = jest
        .spyOn(service as any, 'sumsubRequest')
        .mockResolvedValue(applicant);

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-1',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
        providerApplicant: {
          levelName: 'basic-kyc-level',
          inspectionId: 'insp-meta-only',
          review: {
            levelName: 'basic-kyc-level',
            reviewStatus: 'completed',
            reviewResult: { reviewAnswer: 'GREEN' },
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'GET',
        '/resources/applicants/applicant-1/one',
      );
      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Mohamed Fikri',
          provider_level_name: 'basic-kyc-level',
          provider_inspection_id: 'insp-meta-only',
        }),
      );
    });

    it('fetches the applicant once when the payload has no identity and KYC is incomplete', async () => {
      const user = {
        ...mockUser,
        date_of_birth: null,
        nationality: 'MA',
        kyc_status: 'PENDING',
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
      const fetchSpy = jest
        .spyOn(service as any, 'sumsubRequest')
        .mockResolvedValue(applicant);

      await (service as any).applySumsubReviewStatus({
        userId: user.id,
        source: 'STAYS',
        applicantId: 'applicant-1',
        eventType: 'applicantReviewed',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'GET',
        '/resources/applicants/applicant-1/one',
      );
      expect(mockKycRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Mohamed Fikri', document_type: 'CNIE' }),
      );
    });
  });

  describe('Sumsub webhook dossier/media sync', () => {
    it('applicantReviewed triggers persistSumsubDossierArtifacts after status apply', async () => {
      jest.spyOn(service as any, 'verifySumsubWebhookDigest').mockReturnValue(undefined);
      jest.spyOn(service as any, 'applySumsubReviewStatus').mockResolvedValue({
        updated: true,
        status: 'VERIFIED',
      });
      const persistSpy = jest
        .spyOn(service as any, 'persistSumsubDossierArtifacts')
        .mockResolvedValue(undefined);

      await service.processSumsubWebhook({
        type: 'applicantReviewed',
        applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        externalUserId: 'STAYS_user-123',
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
      });

      expect(persistSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      );
    });

    it('applicantPending also pulls dossier media once docs are uploaded', async () => {
      jest.spyOn(service as any, 'verifySumsubWebhookDigest').mockReturnValue(undefined);
      jest.spyOn(service as any, 'applySumsubReviewStatus').mockResolvedValue({
        updated: true,
        status: 'PENDING',
      });
      const persistSpy = jest
        .spyOn(service as any, 'persistSumsubDossierArtifacts')
        .mockResolvedValue(undefined);

      await service.processSumsubWebhook({
        type: 'applicantPending',
        applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        externalUserId: 'STAYS_user-123',
        reviewStatus: 'pending',
      });

      expect(persistSpy).toHaveBeenCalled();
    });

    it('does not pull media for unrelated webhook types', async () => {
      jest.spyOn(service as any, 'verifySumsubWebhookDigest').mockReturnValue(undefined);
      jest.spyOn(service as any, 'applySumsubReviewStatus').mockResolvedValue({
        updated: true,
        status: 'PENDING',
      });
      const persistSpy = jest
        .spyOn(service as any, 'persistSumsubDossierArtifacts')
        .mockResolvedValue(undefined);

      await service.processSumsubWebhook({
        type: 'applicantCreated',
        applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        externalUserId: 'STAYS_user-123',
      });

      expect(persistSpy).not.toHaveBeenCalled();
    });

    it('acks webhook when status apply throws (no uncaught 500)', async () => {
      jest.spyOn(service as any, 'verifySumsubWebhookDigest').mockReturnValue(undefined);
      jest
        .spyOn(service as any, 'applySumsubReviewStatus')
        .mockRejectedValue(new Error('db down'));
      const persistSpy = jest
        .spyOn(service as any, 'persistSumsubDossierArtifacts')
        .mockResolvedValue(undefined);

      await expect(
        service.processSumsubWebhook({
          type: 'applicantReviewed',
          applicantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          externalUserId: 'STAYS_user-123',
          reviewStatus: 'completed',
          reviewResult: { reviewAnswer: 'GREEN' },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          received: true,
          updated: false,
          reason: 'status_apply_failed',
        }),
      );
      expect(persistSpy).toHaveBeenCalled();
    });
  });
});
