import { UnauthorizedException } from '@nestjs/common';
import { AccountStatusGuard } from './account-status.guard';
import { AuthzVersionService } from '../../modules/auth/authz-version.service';

describe('AccountStatusGuard 047', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const authzVersions = { getAuthzState: jest.fn() };
  const guard = new AccountStatusGuard(
    reflector as any,
    authzVersions as unknown as AuthzVersionService,
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
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 1,
      status: 'ACTIVE',
      account_type: 'CONSUMER',
    });
    await expect(
      guard.canActivate(ctx({ userId: 'c1', account_type: 'CONSUMER' })),
    ).resolves.toBe(true);
  });

  it('denies SUSPENDED consumer on ordinary JWT routes', async () => {
    authzVersions.getAuthzState.mockResolvedValue({
      authz_version: 2,
      status: 'SUSPENDED',
      account_type: 'CONSUMER',
    });
    await expect(
      guard.canActivate(ctx({ userId: 'c1', account_type: 'CONSUMER' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies FROZEN and BANNED consumers', async () => {
    for (const status of ['FROZEN', 'BANNED']) {
      authzVersions.getAuthzState.mockResolvedValue({
        authz_version: 2,
        status,
        account_type: 'CONSUMER',
      });
      await expect(
        guard.canActivate(ctx({ userId: 'c1' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('skips otp_session tokens', async () => {
    await expect(
      guard.canActivate(ctx({ userId: 'c1', type: 'otp_session' })),
    ).resolves.toBe(true);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });

  it('skips public routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(ctx({ userId: 'c1' }))).resolves.toBe(true);
    expect(authzVersions.getAuthzState).not.toHaveBeenCalled();
  });
});
