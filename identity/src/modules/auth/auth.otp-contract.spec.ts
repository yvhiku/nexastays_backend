import { AuthController } from './auth.controller';

describe('AuthController OTP response compatibility', () => {
  const authService = {
    verifyOtp: jest.fn(),
  };
  const metrics = {
    incrementOtpVerifyFailure: jest.fn(),
  };
  const controller = new AuthController(
    authService as never,
    { audit: jest.fn() } as never,
    metrics as never,
    { logEvent: jest.fn() } as never,
  );
  const req = {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps v2 JWT/session fields and adds canonical onboarding', async () => {
    const result = {
      verified: true,
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      otp_session_token: 'otp-session',
      identity_session_token: 'otp-session',
      accounts: [{ id: 'consumer-1', account_type: 'CONSUMER' }],
      account: { id: 'consumer-1', type: 'CONSUMER' },
      onboarding: {
        required: true,
        status: 'NOT_STARTED',
        next: 'REGISTRATION',
      },
    };
    authService.verifyOtp.mockResolvedValue(result);

    await expect(
      controller.verifyOtpV2(
        { phone_number: '+212600000001', otp: '123456' },
        req,
      ),
    ).resolves.toEqual(result);
  });

  it('keeps the legacy verify-otp response boolean-only', async () => {
    authService.verifyOtp.mockResolvedValue({
      verified: true,
      access_token: 'access-token',
      onboarding: {
        required: true,
        status: 'NOT_STARTED',
        next: 'REGISTRATION',
      },
    });

    await expect(
      controller.verifyOtp(
        { phone_number: '+212600000002', otp: '123456' },
        req,
      ),
    ).resolves.toEqual({ verified: true });
  });
});
