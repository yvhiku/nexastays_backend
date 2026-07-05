import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { UserConsent } from './entities/user-consent.entity';
import { OtpCode } from '../auth/entities/otp-code.entity';
import { DataSource } from 'typeorm';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerPostingService } from '../ledger/ledger-posting.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UnifiedIdentityService } from './unified-identity.service';
import { IdentityPhoneNumbersService } from './identity-phone-numbers.service';
import { ProfileSyncService } from './profile-sync.service';

describe('UsersService (profile lock)', () => {
  let service: UsersService;
  let userRepo: Repository<User>;

  const mockUserRepo = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockWalletRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockLedgerAccountRepo = { save: jest.fn() };
  const mockLedgerEntryRepo = { save: jest.fn() };
  const mockLedgerTxnRepo = { save: jest.fn() };
  const mockAppTransactionRepo = { find: jest.fn(), save: jest.fn() };
  const mockKycRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockAuditRepo = { save: jest.fn(), create: jest.fn() };
  const mockRefreshTokenRepo = {
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    })),
  };
  const mockTrustedDeviceRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
  const mockUserConsentRepo = { find: jest.fn(), save: jest.fn(), create: jest.fn() };
  const mockDataSource = { transaction: jest.fn() };
  const mockLedgerService = { getBalance: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Wallet), useValue: mockWalletRepo },
        {
          provide: getRepositoryToken(LedgerAccount),
          useValue: mockLedgerAccountRepo,
        },
        {
          provide: getRepositoryToken(LedgerEntry),
          useValue: mockLedgerEntryRepo,
        },
        {
          provide: getRepositoryToken(LedgerTransaction),
          useValue: mockLedgerTxnRepo,
        },
        {
          provide: getRepositoryToken(AppTransaction),
          useValue: mockAppTransactionRepo,
        },
        { provide: getRepositoryToken(KycProfile), useValue: mockKycRepo },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditRepo },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepo,
        },
        {
          provide: getRepositoryToken(TrustedDevice),
          useValue: mockTrustedDeviceRepo,
        },
        {
          provide: getRepositoryToken(UserConsent),
          useValue: mockUserConsentRepo,
        },
        { provide: getRepositoryToken(OtpCode), useValue: { findOne: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LedgerService, useValue: mockLedgerService },
        {
          provide: LedgerPostingService,
          useValue: { postTwoLegJournal: jest.fn(), postJournal: jest.fn() },
        },
        {
          provide: UnifiedIdentityService,
          useValue: { findOrCreateByPhone: jest.fn(), getProfileByPhone: jest.fn() },
        },
        {
          provide: IdentityPhoneNumbersService,
          useValue: { tryNormalize: jest.fn((s: string) => s) },
        },
        {
          provide: ProfileSyncService,
          useValue: { updateSharedProfile: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = mod.get<UsersService>(UsersService);
    userRepo = mod.get(getRepositoryToken(User));
  });

  describe('updateProfile - not locked', () => {
    it('allows updating full_name, city, date_of_birth', async () => {
      const user = {
        id: 'u1',
        full_name: 'Alice',
        email: 'a@b.com',
        city: null,
        date_of_birth: null,
        profile_photo_url: null,
        profile_locked_at: null,
        kyc_status: 'PENDING',
        nationality: 'MA',
        unified_identity_id: null,
        account_type: 'CONSUMER',
      } as User;
      mockUserRepo.findOne.mockResolvedValue(user);
      mockUserRepo.findOneOrFail.mockResolvedValue({ ...user, ...{ full_name: 'Alice Updated', city: 'Rabat', date_of_birth: new Date('1990-05-15') } });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve({ ...user, ...u }));

      const dto: UpdateProfileDto = {
        full_name: 'Alice Updated',
        city: 'Rabat',
        date_of_birth: '1990-05-15',
      };
      await service.updateProfile('u1', dto);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.full_name).toBe('Alice Updated');
      expect(saved.city).toBe('Rabat');
      expect(saved.date_of_birth).toEqual(new Date('1990-05-15'));
    });
  });

  describe('updateProfile - locked', () => {
    const lockedUser = {
      id: 'u2',
      full_name: 'Bob',
      email: 'b@b.com',
      city: 'Casablanca',
      date_of_birth: new Date('1985-01-10'),
      profile_photo_url: null,
      profile_locked_at: new Date(),
      kyc_status: 'APPROVED',
      nationality: 'MA',
      unified_identity_id: null,
      account_type: 'CONSUMER',
    } as User;

    it('throws 403 PROFILE_LOCKED when updating full_name', async () => {
      mockUserRepo.findOne.mockResolvedValue(lockedUser);

      await expect(
        service.updateProfile('u2', { full_name: 'Bob Updated' }),
      ).rejects.toMatchObject({
        response: { code: 'PROFILE_LOCKED' },
      });
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('allows updating email when locked', async () => {
      mockUserRepo.findOne.mockResolvedValue(lockedUser);
      mockUserRepo.findOneOrFail.mockResolvedValue({ ...lockedUser, email: 'new@b.com' });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve({ ...lockedUser, ...u }));

      await service.updateProfile('u2', { email: 'new@b.com' });

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.email).toBe('new@b.com');
    });

    it('allows updating city when locked', async () => {
      mockUserRepo.findOne.mockResolvedValue(lockedUser);
      mockUserRepo.findOneOrFail.mockResolvedValue({ ...lockedUser, city: 'Casablanca' });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve({ ...lockedUser, ...u }));

      await service.updateProfile('u2', { city: 'Casablanca' });

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.city).toBe('Casablanca');
    });

    it('allows updating profile_photo_url when locked', async () => {
      mockUserRepo.findOne.mockResolvedValue(lockedUser);
      mockUserRepo.findOneOrFail.mockResolvedValue({ ...lockedUser, profile_photo_url: 'https://example.com/photo.jpg' });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve({ ...lockedUser, ...u }));

      await service.updateProfile('u2', {
        profile_photo_url: 'https://example.com/photo.jpg',
      });

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.profile_photo_url).toBe('https://example.com/photo.jpg');
    });
  });

  describe('createUser - 23505 idempotency (race simulation)', () => {
    const mockUnified = { findOrCreateByPhone: jest.fn().mockResolvedValue({}) };

    beforeEach(() => {
      (service as any).unifiedIdentityService = mockUnified;
    });

    it('returns existing consumer when insert hits uniq_consumer_per_phone', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const existingUser = {
        id: 'u-existing',
        phone_number: '+212612345678',
        account_type: 'CONSUMER',
        full_name: 'Existing',
      } as User;

      mockDataSource.transaction.mockImplementation(async (fn: (m: any) => any) => {
        const manager = {
          save: jest
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' })),
        };
        return fn(manager);
      });
      mockUserRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingUser);

      const result = await service.createUser({
        phone_number: '+212612345678',
        full_name: 'Alice',
        pin: '1234',
      });

      expect(result).toEqual(existingUser);
    });
  });

  describe('ensureRoleAccount - 23505 idempotency (race simulation)', () => {
    const mockUnified = {
      findById: jest.fn().mockResolvedValue({ id: 'id-1', phone_number: '+212612345678' }),
      refreshLinkedServices: jest.fn().mockResolvedValue(undefined),
    };
    const mockIdentityPhone = {
      tryNormalize: jest.fn((s: string) => s),
      getPrimaryPhone: jest.fn().mockResolvedValue('+212612345678'),
    };

    beforeEach(() => {
      (service as any).unifiedIdentityService = mockUnified;
      (service as any).identityPhoneNumbersService = mockIdentityPhone;
    });

    it('returns existing role account when save hits uniq_*_per_unified_identity', async () => {
      const existingHost = {
        id: 'u-host',
        phone_number: '+212612345678',
        account_type: 'HOST',
        unified_identity_id: 'id-1',
      } as User;

      mockUserRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingHost);
      mockUserRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      const result = await service.ensureRoleAccount({
        phone_number: '+212612345678',
        account_type: 'HOST',
        unified_identity_id: 'id-1',
        full_name: 'Host User',
      });

      expect(result).toEqual(existingHost);
    });
  });

  describe('getMe', () => {
    it('returns profile_locked and locked_fields when KYC approved', async () => {
      const user = {
        id: 'u3',
        phone_number: '+212612345678',
        full_name: 'Carol',
        email: 'c@b.com',
        city: 'Fes',
        date_of_birth: new Date('1992-03-20'),
        profile_photo_url: null,
        profile_locked_at: new Date(),
        kyc_status: 'APPROVED',
        linked_user: null,
      } as User;
      mockUserRepo.findOne.mockResolvedValue(user);

      const out = await service.getMe('u3');
      expect(out.profile_locked).toBe(true);
      expect(out.locked_fields).toEqual(['full_name', 'date_of_birth']);
      expect(out.city).toBe('Fes');
      expect(out.date_of_birth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
