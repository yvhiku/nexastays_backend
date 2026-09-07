import { UnauthorizedException } from '@nestjs/common';
import { AccountStatusGuard } from './account-status.guard';
import { IdentityAuthzClient } from '../identity/identity-authz.client';

describe('Stays AccountStatusGuard 047', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const authzClient = { getAuthzState: jest.fn() };
  const guard = new AccountStatusGuard(
    reflector as any,
    authzClient as unknown as IdentityAuthzClient,
  );

  function ctx(user: Record<string, unknown> | undefined) {
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
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('allows ACTIVE consumer', async () => {
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 1,
      status: 'ACTIVE',
      account_type: 'CONSUMER',
    });
    await expect(guard.canActivate(ctx({ userId: 'c1' }))).resolves.toBe(true);
  });

  it('denies SUSPENDED consumer', async () => {
    authzClient.getAuthzState.mockResolvedValue({
      authz_version: 4,
      status: 'SUSPENDED',
      account_type: 'CONSUMER',
    });
    await expect(guard.canActivate(ctx({ userId: 'c1' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
