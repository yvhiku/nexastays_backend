/**
 * Tests for IdentityPhoneNumbersService, including 23505 idempotency in attachPhoneNumberToIdentity.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IdentityPhoneNumbersService } from './identity-phone-numbers.service';
import { IdentityPhoneNumber } from './entities/identity-phone-number.entity';
import { UnifiedIdentity } from './entities/unified-identity.entity';

describe('IdentityPhoneNumbersService', () => {
  let service: IdentityPhoneNumbersService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; count: jest.Mock; update: jest.Mock };

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const mockIdentityRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityPhoneNumbersService,
        { provide: getRepositoryToken(IdentityPhoneNumber), useValue: mockRepo },
        { provide: getRepositoryToken(UnifiedIdentity), useValue: mockIdentityRepo },
      ],
    }).compile();
    service = mod.get(IdentityPhoneNumbersService);
    repo = mockRepo;
  });

  describe('attachPhoneNumberToIdentity - 23505 idempotency', () => {
    it('returns existing row when save hits unique violation for same identity (race)', async () => {
      const identityId = 'id-1';
      const existingRow = {
        id: 'row-1',
        identity_id: identityId,
        normalized_phone_number: '+212612345678',
        is_primary: true,
      } as IdentityPhoneNumber;

      mockIdentityRepo.findOne.mockResolvedValue({ id: identityId });
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.count.mockResolvedValue(0);
      mockRepo.create.mockReturnValue({ identity_id: identityId, normalized_phone_number: '+212612345678' });
      mockRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existingRow);

      const result = await service.attachPhoneNumberToIdentity(
        identityId,
        '+212612345678',
      );

      expect(result).toEqual(existingRow);
    });

    it('throws Conflict when 23505 and row belongs to different identity', async () => {
      mockIdentityRepo.findOne.mockResolvedValue({ id: 'id-1' });
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.count.mockResolvedValue(0);
      mockRepo.create.mockReturnValue({ identity_id: 'id-1', normalized_phone_number: '+212612345678' });
      mockRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'row-other',
        identity_id: 'id-other',
        normalized_phone_number: '+212612345678',
      });

      await expect(
        service.attachPhoneNumberToIdentity('id-1', '+212612345678'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
