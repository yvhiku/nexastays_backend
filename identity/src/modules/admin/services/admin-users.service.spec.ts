import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { hashPassword, hashPin } from '../../../common/security/secret-crypto';

jest.mock('../../../common/security/secret-crypto', () => ({
  hashPassword: jest.fn(async () => 'argon2-staff-hash'),
  hashPin: jest.fn(async () => 'pin-hash'),
}));

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
    {} as any,
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

describe('AdminUsersService.listSupportAgents', () => {
  const usersRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const refreshTokenRepository = {
    createQueryBuilder: jest.fn(),
  };
  const authzVersions = { bump: jest.fn() };
  const auditService = { logAction: jest.fn() };

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
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns SUPPORT_AGENT staff including frozen, without secrets', async () => {
    usersRepository.find.mockResolvedValue([
      {
        id: 'agent-frozen',
        full_name: 'Frozen Agent',
        email: 'frozen@nexa.test',
        profile_photo_url: null,
        status: 'FROZEN',
        staff_role: 'SUPPORT_AGENT',
        pin_hash: 'secret',
      },
      {
        id: 'agent-1',
        full_name: 'Sarah Ahmed',
        email: 'sarah@nexa.test',
        profile_photo_url: 'https://cdn/sarah.jpg',
        status: 'ACTIVE',
        staff_role: 'SUPPORT_AGENT',
        pin_hash: 'secret',
      },
    ]);

    await expect(service.listSupportAgents()).resolves.toEqual({
      items: [
        {
          id: 'agent-frozen',
          full_name: 'Frozen Agent',
          email: 'frozen@nexa.test',
          profile_photo_url: null,
          status: 'FROZEN',
          staff_role: 'SUPPORT_AGENT',
        },
        {
          id: 'agent-1',
          full_name: 'Sarah Ahmed',
          email: 'sarah@nexa.test',
          profile_photo_url: 'https://cdn/sarah.jpg',
          status: 'ACTIVE',
          staff_role: 'SUPPORT_AGENT',
        },
      ],
    });
    expect(usersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account_type: 'ADMIN', staff_role: 'SUPPORT_AGENT' },
      }),
    );
  });

  it('returns an empty roster when no support agents exist', async () => {
    usersRepository.find.mockResolvedValue([]);
    await expect(service.listSupportAgents()).resolves.toEqual({ items: [] });
  });
});

describe('AdminUsersService.createSupportAgent', () => {
  const usersRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const auditService = { logAction: jest.fn() };
  const unifiedIdentityService = {
    ensureIdentityForAdminUser: jest.fn(),
  };

  const service = new AdminUsersService(
    usersRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    auditService as any,
    { bump: jest.fn() } as any,
    unifiedIdentityService as any,
  );

  const previousAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAILS = 'super@nexa.test';
    usersRepository.save.mockImplementation(async (row) => ({
      id: 'agent-new',
      ...row,
    }));
    unifiedIdentityService.ensureIdentityForAdminUser.mockResolvedValue(
      'identity-agent',
    );
  });

  afterEach(() => {
    if (previousAdminEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = previousAdminEmails;
    }
  });

  it('creates a SUPPORT_AGENT with hashed staff password and no password in the audit', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createSupportAgent(
        {
          email: 'Agent@Nexa.test',
          fullName: 'Sarah Ahmed',
          password: 'agent-secret-password',
        },
        { userId: 'admin-1', email: 'super@nexa.test' },
      ),
    ).resolves.toEqual({
      id: 'agent-new',
      email: 'agent@nexa.test',
      fullName: 'Sarah Ahmed',
      staffRole: 'SUPPORT_AGENT',
    });

    expect(hashPassword).toHaveBeenCalledWith('agent-secret-password');
    expect(hashPin).toHaveBeenCalled();
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'agent@nexa.test',
        full_name: 'Sarah Ahmed',
        account_type: 'ADMIN',
        staff_role: 'SUPPORT_AGENT',
        status: 'ACTIVE',
        kyc_status: 'APPROVED',
        staff_password_hash: 'argon2-staff-hash',
        pin_hash: 'pin-hash',
        phone_number: null,
      }),
    );
    expect(
      unifiedIdentityService.ensureIdentityForAdminUser,
    ).toHaveBeenCalledWith('agent-new');
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPORT_AGENT_CREATED',
        metadata: { email: 'agent@nexa.test', userId: 'agent-new' },
      }),
    );
    const auditArg = auditService.logAction.mock.calls[0][0];
    expect(JSON.stringify(auditArg)).not.toContain('agent-secret-password');
    expect(JSON.stringify(auditArg)).not.toContain('password');
  });

  it('rejects duplicate emails', async () => {
    usersRepository.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createSupportAgent({
        email: 'taken@nexa.test',
        fullName: 'Taken',
        password: 'agent-secret-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('rejects Super Admin bootstrap allowlist emails', async () => {
    await expect(
      service.createSupportAgent({
        email: 'super@nexa.test',
        fullName: 'Nope',
        password: 'agent-secret-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.findOne).not.toHaveBeenCalled();
    expect(usersRepository.save).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 10 characters', async () => {
    await expect(
      service.createSupportAgent({
        email: 'agent@nexa.test',
        fullName: 'Sarah',
        password: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.save).not.toHaveBeenCalled();
  });
});
