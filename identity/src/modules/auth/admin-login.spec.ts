import { AuthService } from './auth.service';
import { hashPassword } from '../../common/security/secret-crypto';

describe('AuthService.adminLogin', () => {
  const SUPER_EMAIL = 'super@nexa.test';
  const SUPER_PASSWORD = 'admin123';
  const AGENT_EMAIL = 'agent@nexa.test';
  const AGENT_PASSWORD = 'agent-secret-password';

  let userRepository: { findOne: jest.Mock; save: jest.Mock };
  let otpLockoutService: {
    isLockedOut: jest.Mock;
    recordFailure: jest.Mock;
    recordSuccess: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let unifiedIdentityService: { ensureIdentityForAdminUser: jest.Mock };
  let kycProfileRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: AuthService;
  let agentHash: string;
  const envSnapshot = {
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  };

  function buildService(): AuthService {
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (row) => ({
        id: row.id ?? 'saved-id',
        authz_version: 1,
        ...row,
      })),
    };
    otpLockoutService = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
    };
    jwtService = {
      sign: jest.fn((payload) => `jwt:${JSON.stringify(payload)}`),
      verify: jest.fn(),
    };
    const refreshTokenRepository = {
      save: jest.fn().mockResolvedValue({}),
    };
    unifiedIdentityService = {
      ensureIdentityForAdminUser: jest.fn().mockResolvedValue('identity-1'),
    };
    kycProfileRepository = {
      findOne: jest.fn().mockResolvedValue({
        status: 'VERIFIED',
        level: 'TIER_2',
        provider: 'ADMIN',
      }),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };

    return new AuthService(
      userRepository as never,
      {} as never,
      {} as never,
      refreshTokenRepository as never,
      {} as never,
      otpLockoutService as never,
      {} as never,
      jwtService as never,
      {} as never,
      unifiedIdentityService as never,
      {} as never,
      {} as never,
      kycProfileRepository as never,
    );
  }

  function superAdminUser() {
    return {
      id: 'super-1',
      email: SUPER_EMAIL,
      full_name: 'Super Admin',
      account_type: 'ADMIN',
      staff_role: 'ADMIN',
      authz_version: 1,
      kyc_status: 'APPROVED',
      status: 'ACTIVE',
      phone_number: null,
    };
  }

  function agentUser(hash: string) {
    return {
      id: 'agent-1',
      email: AGENT_EMAIL,
      full_name: 'Sarah Ahmed',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
      staff_password_hash: hash,
      authz_version: 1,
      kyc_status: 'APPROVED',
      status: 'ACTIVE',
      phone_number: null,
    };
  }

  beforeAll(async () => {
    agentHash = await hashPassword(AGENT_PASSWORD);
  }, 30000);

  beforeEach(() => {
    process.env.ADMIN_EMAILS = SUPER_EMAIL;
    process.env.ADMIN_PASSWORD = SUPER_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    service = buildService();
  });

  afterAll(() => {
    if (envSnapshot.ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = envSnapshot.ADMIN_EMAILS;
    if (envSnapshot.ADMIN_PASSWORD === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = envSnapshot.ADMIN_PASSWORD;
    }
    if (envSnapshot.ADMIN_PASSWORD_HASH === undefined) {
      delete process.env.ADMIN_PASSWORD_HASH;
    } else {
      process.env.ADMIN_PASSWORD_HASH = envSnapshot.ADMIN_PASSWORD_HASH;
    }
  });

  it('issues ADMIN roles for Super Admin allowlist login', async () => {
    const user = superAdminUser();
    userRepository.findOne.mockResolvedValue(user);

    const result = await service.adminLogin(SUPER_EMAIL, SUPER_PASSWORD);

    expect(result).not.toBeNull();
    expect(result?.user.roles).toEqual(['ADMIN']);
    expect(result?.user.role).toBe('ADMIN');
    expect(result?.user.staff_role).toBe('ADMIN');
    expect(result?.refresh_token).toEqual(expect.any(String));
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['ADMIN'], role: 'ADMIN' }),
      expect.any(Object),
    );
    expect(otpLockoutService.recordFailure).not.toHaveBeenCalled();
  });

  it('stamps ADMIN JWT roles for ADMIN account_type even without a profile', () => {
    service.issueAccountScopedToken('u1', 'id-1', 'ADMIN', 'pin_only');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        account_type: 'ADMIN',
        role: 'ADMIN',
        roles: ['ADMIN'],
      }),
      expect.any(Object),
    );
  });

  it('issues SUPPORT_AGENT roles only for a provisioned agent password', async () => {
    const user = agentUser(agentHash);
    userRepository.findOne.mockResolvedValue(user);

    const result = await service.adminLogin(AGENT_EMAIL, AGENT_PASSWORD);

    expect(result).not.toBeNull();
    expect(result?.user.roles).toEqual(['SUPPORT_AGENT']);
    expect(result?.user.role).toBe('SUPPORT_AGENT');
    expect(result?.user.staff_role).toBe('SUPPORT_AGENT');
    expect(result?.refresh_token).toEqual(expect.any(String));
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['SUPPORT_AGENT'],
        role: 'SUPPORT_AGENT',
      }),
      expect.any(Object),
    );
    expect(result?.user).not.toHaveProperty('staff_password_hash');
  });

  it('fails provisioned staff login with the wrong password', async () => {
    userRepository.findOne.mockResolvedValue(agentUser(agentHash));

    const result = await service.adminLogin(AGENT_EMAIL, 'wrong-password');

    expect(result).toBeNull();
    expect(otpLockoutService.recordFailure).toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('fails unknown emails with the same generic failure', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.adminLogin('nobody@nexa.test', AGENT_PASSWORD);

    expect(result).toBeNull();
    expect(otpLockoutService.recordFailure).toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
