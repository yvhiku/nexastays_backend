import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { AuthzVersionService } from '../../modules/auth/authz-version.service';

describe('RolesGuard SEC-003', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const authzVersions = {
    getAuthzState: jest.fn(),
  };

  const guard = new RolesGuard(
    reflector as any,
    authzVersions as unknown as AuthzVersionService,
  );

  function ctx(user: Record<string, unknown> | null) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows valid ADMIN when authz_version matches', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 3,
      status: 'ACTIVE',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'u1', roles: ['ADMIN'], av: 3, authz_version: 3 }),
      ),
    ).resolves.toBe(true);
  });

  it('denies non-admin JWT on ADMIN route', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', account_type: 'CONSUMER' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });

  it('denies ADMIN JWT after demotion (DB account_type != ADMIN)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 3,
      status: 'ACTIVE',
      account_type: 'CONSUMER',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'u1', roles: ['ADMIN'], av: 3 }),
      ),
    ).rejects.toThrow(/revoked/i);
  });

  it('denies ADMIN JWT when authz_version mismatches (revocation)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 4,
      status: 'ACTIVE',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'u1', roles: ['ADMIN'], av: 3 }),
      ),
    ).rejects.toThrow(/revoked/i);
  });

  it('denies frozen ADMIN', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 3,
      status: 'FROZEN',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'u1', roles: ['ADMIN'], av: 3 }),
      ),
    ).rejects.toThrow(/revoked/i);
  });

  it('does not check authz_version for non-ADMIN role requirements', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', account_type: 'CONSUMER' })),
    ).resolves.toBe(true);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });

  it('does not treat account_type ADMIN as a JWT role', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(
      guard.canActivate(ctx({ userId: 'u1', account_type: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });

  it('denies SUPPORT_AGENT on ADMIN routes without live lookup', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(
      guard.canActivate(
        ctx({
          userId: 'agent-1',
          roles: ['SUPPORT_AGENT'],
          role: 'SUPPORT_AGENT',
          av: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });

  it('allows SUPPORT_AGENT on SUPPORT_AGENT routes when av matches', async () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPPORT_AGENT']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 2,
      status: 'ACTIVE',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
    });
    await expect(
      guard.canActivate(
        ctx({
          userId: 'agent-1',
          roles: ['SUPPORT_AGENT'],
          av: 2,
          authz_version: 2,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('denies frozen SUPPORT_AGENT', async () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPPORT_AGENT']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 2,
      status: 'FROZEN',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'agent-1', roles: ['SUPPORT_AGENT'], av: 2 }),
      ),
    ).rejects.toThrow(/revoked/i);
  });

  it('denies stale SUPPORT_AGENT token after av bump', async () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPPORT_AGENT']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 5,
      status: 'ACTIVE',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'agent-1', roles: ['SUPPORT_AGENT'], av: 2 }),
      ),
    ).rejects.toThrow(/revoked/i);
  });

  it('cannot upgrade privilege from client role claim alone without ADMIN requirement path', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 1,
      status: 'ACTIVE',
      account_type: 'CONSUMER',
    });
    await expect(
      guard.canActivate(
        ctx({
          userId: 'u1',
          roles: ['ADMIN'],
          account_type: 'ADMIN',
          av: 1,
        }),
      ),
    ).rejects.toThrow(/revoked/i);
  });
});
