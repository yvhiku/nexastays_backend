import { IdentityAuthzClient } from './identity-authz.client';

describe('IdentityAuthzClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not reuse a previous live authz lookup', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authz_version: 1,
          status: 'ACTIVE',
          account_type: 'ADMIN',
          staff_role: 'ADMIN',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authz_version: 2,
          status: 'ACTIVE',
          account_type: 'ADMIN',
          staff_role: 'SUPPORT_AGENT',
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new IdentityAuthzClient();
    const first = await client.getAuthzState('user-1');
    const second = await client.getAuthzState('user-1');

    expect(first.authz_version).toBe(1);
    expect(first.staff_role).toBe('ADMIN');
    expect(second.authz_version).toBe(2);
    expect(second.staff_role).toBe('SUPPORT_AGENT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
