import { AuthController } from './auth.controller';

describe('AuthController login SEC-004 enumeration', () => {
  const authService = {
    findUserByPhone: jest.fn(),
    padLoginEnumerationWork: jest.fn().mockResolvedValue(undefined),
  };
  const securityEvents = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  const controller = new AuthController(
    authService as never,
    { audit: jest.fn().mockResolvedValue(undefined) } as never,
    { incrementOtpSend: jest.fn() } as never,
    securityEvents as never,
  );

  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    authService.padLoginEnumerationWork.mockResolvedValue(undefined);
  });

  it('unknown phone returns existence-neutral { ok: true }', async () => {
    authService.findUserByPhone.mockResolvedValue(null);
    const body = await controller.login(
      { phone_number: '+212600000001' } as any,
      req,
    );
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toMatch(/exists|not found|USER_NOT/i);
    expect(authService.padLoginEnumerationWork).toHaveBeenCalled();
  });

  it('known phone returns the same public shape', async () => {
    authService.findUserByPhone.mockResolvedValue({ id: 'u1' });
    const body = await controller.login(
      { phone_number: '+212600000002' } as any,
      req,
    );
    expect(body).toEqual({ ok: true });
    expect(Object.keys(body).sort()).toEqual(['ok']);
  });

  it('pads both known and unknown paths (structural timing equivalence)', async () => {
    authService.findUserByPhone.mockResolvedValueOnce(null);
    await controller.login({ phone_number: '+212600000003' } as any, req);
    authService.findUserByPhone.mockResolvedValueOnce({ id: 'u2' });
    await controller.login({ phone_number: '+212600000004' } as any, req);
    expect(authService.padLoginEnumerationWork).toHaveBeenCalledTimes(2);
  });
});
