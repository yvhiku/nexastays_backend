import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { IdentityAuthzClient } from '../identity/identity-authz.client';

describe('Stays RolesGuard SEC-003', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const authzClient = {
    getAuthzState: jest.fn(),
  };
  const guard = new RolesGuard(
    reflector as any,
    authzClient as unknown as IdentityAuthzClient,
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

  beforeEach(() => jest.clearAllMocks());

  it('allows matching ADMIN authz_version', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 2,
      status: 'ACTIVE',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(ctx({ userId: 'a1', roles: ['ADMIN'], av: 2 })),
    ).resolves.toBe(true);
  });

  it('denies stale ADMIN token after Identity revocation', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 5,
      status: 'ACTIVE',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(ctx({ userId: 'a1', roles: ['ADMIN'], av: 2 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('leaves guest authorization unchecked when no roles required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(ctx({ userId: 'g1', account_type: 'CONSUMER' })),
    ).resolves.toBe(true);
    expect(authzClient.getAuthzState).not.toHaveBeenCalled();
  });

  it('denies SUPPORT_AGENT on ADMIN routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    await expect(
      guard.canActivate(
        ctx({ userId: 'agent-1', roles: ['SUPPORT_AGENT'], av: 1 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authzClient.getAuthzState).not.toHaveBeenCalled();
  });

  it('runs live authz for SUPPORT_AGENT routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPPORT_AGENT']);
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 3,
      status: 'ACTIVE',
      account_type: 'ADMIN',
      staff_role: 'SUPPORT_AGENT',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'agent-1', roles: ['SUPPORT_AGENT'], av: 3 }),
      ),
    ).resolves.toBe(true);
  });

  it('denies frozen SUPPORT_AGENT on SUPPORT_AGENT routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPPORT_AGENT']);
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 3,
      status: 'FROZEN',
      account_type: 'ADMIN',
    });
    await expect(
      guard.canActivate(
        ctx({ userId: 'agent-1', roles: ['SUPPORT_AGENT'], av: 3 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
