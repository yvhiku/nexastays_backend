import { ForbiddenException } from '@nestjs/common';
import { InternalUsersController } from './internal-users.controller';
import { UsersService } from './users.service';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';

describe('InternalUsersController.listActiveSupportAgents', () => {
  const usersService = {
    listActiveSupportAgents: jest.fn(),
  };
  const controller = new InternalUsersController(
    usersService as unknown as UsersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the ACTIVE-only S2S roster', async () => {
    usersService.listActiveSupportAgents.mockResolvedValue({
      items: [
        { id: 'agent-1', status: 'ACTIVE', staff_role: 'SUPPORT_AGENT' },
      ],
    });

    await expect(controller.listActiveSupportAgents()).resolves.toEqual({
      items: [
        { id: 'agent-1', status: 'ACTIVE', staff_role: 'SUPPORT_AGENT' },
      ],
    });
  });
});

describe('InternalServiceGuard (S2S support-agent roster)', () => {
  const originalKey = process.env.INTERNAL_SERVICE_KEY;
  const guard = new InternalServiceGuard();

  function ctx(headers: Record<string, string>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as never;
  }

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_KEY = 's2s-secret';
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.INTERNAL_SERVICE_KEY;
    } else {
      process.env.INTERNAL_SERVICE_KEY = originalKey;
    }
  });

  it('allows the internal service key', () => {
    expect(guard.canActivate(ctx({ 'x-internal-key': 's2s-secret' }))).toBe(
      true,
    );
  });

  it('rejects a SUPPORT_AGENT JWT with no internal key', () => {
    expect(() =>
      guard.canActivate(
        ctx({ authorization: 'Bearer agent-jwt' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a wrong internal key', () => {
    expect(() =>
      guard.canActivate(ctx({ 'x-internal-key': 'nope' })),
    ).toThrow(ForbiddenException);
  });
});
