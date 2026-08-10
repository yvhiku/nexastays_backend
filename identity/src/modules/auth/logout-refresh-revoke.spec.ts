import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';

describe('AuthService — logout refresh session revocation', () => {
  const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  let refreshTokenRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let service: AuthService;

  function buildService(): AuthService {
    refreshTokenRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (row) => row),
      createQueryBuilder: jest.fn(),
    };

    return new AuthService(
      {} as never,
      {} as never,
      {} as never,
      refreshTokenRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {
        verify: jest.fn((token: string) => {
          if (token === 'access-a') return { sub: USER_A };
          if (token === 'access-b') return { sub: USER_B };
          throw new Error('invalid');
        }),
        sign: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  beforeEach(() => {
    process.env.REFRESH_TOKEN_PEPPER = 'test-pepper-for-logout-specs';
    service = buildService();
  });

  it('Test 1 — revokeRefreshSessionByToken marks the matching session revoked', async () => {
    const row = {
      id: 'rt-1',
      user_id: USER_A,
      token_hash: 'placeholder',
      revoked_at: null,
    } as RefreshToken;

    // Patch hash lookup by capturing whatever hash is queried
    refreshTokenRepository.findOne.mockImplementation(async ({ where }) => {
      expect(where.token_hash).toHaveLength(64);
      row.token_hash = where.token_hash;
      return row;
    });

    await service.revokeRefreshSessionByToken('refresh-session-a');

    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rt-1',
        user_id: USER_A,
        revoked_at: expect.any(Date),
      }),
    );
  });

  it('Test 2 — logout revoke is idempotent for already-revoked tokens', async () => {
    refreshTokenRepository.findOne.mockResolvedValue({
      id: 'rt-1',
      user_id: USER_A,
      revoked_at: new Date(),
    });

    await service.revokeRefreshSessionByToken('already-revoked-token');
    expect(refreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('Test 5 — unknown/expired refresh revoke is safe and silent', async () => {
    refreshTokenRepository.findOne.mockResolvedValue(null);

    await expect(
      service.revokeRefreshSessionByToken('missing-token'),
    ).resolves.toBeUndefined();
    expect(refreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('Test 4 — revokeRefreshTokens with device_id only touches that device', async () => {
    const deviceRow = {
      id: 'rt-device-a',
      user_id: USER_A,
      device_id: 'device-a',
      revoked_at: null,
    };
    const getMany = jest.fn().mockResolvedValue([deviceRow]);
    const andWhere = jest.fn().mockReturnThis();
    refreshTokenRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere,
      getMany,
    });

    await service.revokeRefreshTokens(USER_A, 'device-a');

    expect(andWhere).toHaveBeenCalledWith('r.device_id = :deviceId', {
      deviceId: 'device-a',
    });
    expect(refreshTokenRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'rt-device-a', revoked_at: expect.any(Date) }),
    ]);
  });

  it('Test 6 — resolveAccessPrincipal does not confuse users across Bearer tokens', async () => {
    const principalA = await service.resolveAccessPrincipal({
      headers: { authorization: 'Bearer access-a' },
    });
    const principalB = await service.resolveAccessPrincipal({
      headers: { authorization: 'Bearer access-b' },
    });

    expect(principalA).toEqual({ userId: USER_A });
    expect(principalB).toEqual({ userId: USER_B });
    expect(principalA?.userId).not.toBe(principalB?.userId);
  });

  it('Test 4 — revoking session A does not touch session B rows', async () => {
    const sessionA = {
      id: 'rt-a',
      user_id: USER_A,
      revoked_at: null as Date | null,
    };
    refreshTokenRepository.findOne.mockResolvedValue(sessionA);

    await service.revokeRefreshSessionByToken('token-session-a');

    expect(refreshTokenRepository.save).toHaveBeenCalledTimes(1);
    expect(refreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rt-a', revoked_at: expect.any(Date) }),
    );
    // findOne is the only lookup — no bulk update of sibling sessions.
    expect(refreshTokenRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('refresh rejects a previously revoked token', async () => {
    refreshTokenRepository.findOne.mockResolvedValue({
      id: 'rt-1',
      user_id: USER_A,
      revoked_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      device_id: null,
    });
    const revokeAll = jest
      .spyOn(service as never, 'revokeAllForUser' as never)
      .mockResolvedValue(undefined as never);

    await expect(
      service.refresh('old-refresh-token', { ip: '127.0.0.1' }),
    ).rejects.toThrow(/reused|revoked|Invalid/i);

    revokeAll.mockRestore();
  });
});
