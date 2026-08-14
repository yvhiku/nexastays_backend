import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService.updateStaffRole', () => {
  const usersRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const refreshTokenRepository = {
    createQueryBuilder: jest.fn(),
  };
  const authzVersions = { bump: jest.fn() };
  const auditService = { logAction: jest.fn() };

  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AdminUsersService(
    usersRepository as any,
    {} as any,
    {} as any,
    {} as any,
    refreshTokenRepository as any,
    {} as any,
    {} as any,
    auditService as any,
    authzVersions as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    refreshTokenRepository.createQueryBuilder.mockReturnValue(qb);
    authzVersions.bump.mockResolvedValue(2);
    usersRepository.save.mockImplementation(async (row) => row);
  });

  it('rejects changing own staff role', async () => {
    await expect(
      service.updateStaffRole('admin-1', 'SUPPORT_AGENT', { userId: 'admin-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects non-ADMIN account types', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      account_type: 'CONSUMER',
      staff_role: 'ADMIN',
    });
    await expect(
      service.updateStaffRole('u2', 'SUPPORT_AGENT', { userId: 'admin-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authzVersions.bump).not.toHaveBeenCalled();
  });

  it('rejects missing users', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.updateStaffRole('missing', 'SUPPORT_AGENT', { userId: 'admin-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets SUPPORT_AGENT, bumps av, revokes refresh, and audits', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      account_type: 'ADMIN',
      staff_role: 'ADMIN',
    });
    await expect(
      service.updateStaffRole('u2', 'SUPPORT_AGENT', { userId: 'admin-1' }),
    ).resolves.toEqual({ success: true, staff_role: 'SUPPORT_AGENT' });
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ staff_role: 'SUPPORT_AGENT' }),
    );
    expect(authzVersions.bump).toHaveBeenCalledWith('u2');
    expect(qb.execute).toHaveBeenCalled();
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAFF_ROLE_CHANGED',
        metadata: { from: 'ADMIN', to: 'SUPPORT_AGENT' },
      }),
    );
  });

  it('can promote SUPPORT_AGENT back to ADMIN', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u2',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
    });
    await expect(
      service.updateStaffRole('u2', 'ADMIN', { userId: 'admin-1' }),
    ).resolves.toEqual({ success: true, staff_role: 'ADMIN' });
    expect(authzVersions.bump).toHaveBeenCalledWith('u2');
  });
});
