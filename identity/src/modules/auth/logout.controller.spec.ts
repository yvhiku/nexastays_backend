import { AuthController } from './auth.controller';

describe('AuthController — logout session scope', () => {
  let authService: {
    revokeRefreshSessionByToken: jest.Mock;
    revokeRefreshTokens: jest.Mock;
    resolveAccessPrincipal: jest.Mock;
  };
  let controller: AuthController;
  let res: { clearCookie: jest.Mock };

  beforeEach(() => {
    authService = {
      revokeRefreshSessionByToken: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
      resolveAccessPrincipal: jest.fn(),
    };
    controller = new AuthController(
      authService as never,
      { audit: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
    );
    res = { clearCookie: jest.fn() };
  });

  it('revokes only the refresh cookie session (current session)', async () => {
    const req = {
      headers: {
        cookie: 'nexa_refresh=session-refresh-a',
        'x-auth-transport': 'cookie',
      },
    };

    const result = await controller.logout({}, req as never, res as never);

    expect(authService.revokeRefreshSessionByToken).toHaveBeenCalledWith(
      'session-refresh-a',
    );
    expect(authService.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('revokes the dashboard admin refresh cookie without reading nexa_refresh', async () => {
    const req = {
      headers: {
        cookie: 'nexa_refresh=consumer-session; nexa_admin_refresh=admin-session',
        'x-auth-transport': 'cookie',
        'x-nexa-client': 'dashboard',
      },
    };

    await controller.logout({}, req as never, res as never);

    expect(authService.revokeRefreshSessionByToken).toHaveBeenCalledWith(
      'admin-session',
    );
  });

  it('is idempotent when no refresh cookie and no device_id', async () => {
    const result = await controller.logout({}, { headers: {} } as never, res as never);

    expect(authService.revokeRefreshSessionByToken).not.toHaveBeenCalled();
    expect(authService.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('device-scoped revoke requires access principal and never revoke-all', async () => {
    authService.resolveAccessPrincipal.mockResolvedValue({
      userId: 'user-a',
    });

    await controller.logout(
      { device_id: 'device-a' },
      { headers: { authorization: 'Bearer access-a' } } as never,
      res as never,
    );

    expect(authService.revokeRefreshTokens).toHaveBeenCalledWith(
      'user-a',
      'device-a',
    );
  });

  it('Test 6 — without refresh token, User A access cannot target User B sessions', async () => {
    authService.resolveAccessPrincipal.mockResolvedValue({
      userId: 'user-a',
    });

    await controller.logout(
      { device_id: 'device-b-of-user-b' },
      { headers: { authorization: 'Bearer access-a' } } as never,
      res as never,
    );

    // Still scoped to principal user-a — cannot pass another user id.
    expect(authService.revokeRefreshTokens).toHaveBeenCalledWith(
      'user-a',
      'device-b-of-user-b',
    );
  });
});
