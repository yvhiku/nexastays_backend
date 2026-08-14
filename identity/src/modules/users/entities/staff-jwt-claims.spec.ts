import { staffJwtClaims } from './user.entity';

describe('staffJwtClaims', () => {
  it('maps ADMIN staff_role to ADMIN-only JWT roles', () => {
    expect(staffJwtClaims('ADMIN')).toEqual({
      role: 'ADMIN',
      roles: ['ADMIN'],
    });
  });

  it('maps SUPPORT_AGENT to SUPPORT_AGENT-only JWT roles', () => {
    expect(staffJwtClaims('SUPPORT_AGENT')).toEqual({
      role: 'SUPPORT_AGENT',
      roles: ['SUPPORT_AGENT'],
    });
  });

  it('never includes ADMIN alongside SUPPORT_AGENT', () => {
    const claims = staffJwtClaims('SUPPORT_AGENT');
    expect(claims.role).not.toBe('ADMIN');
    expect(claims.roles).not.toContain('ADMIN');
  });

  it('defaults unknown or missing values to ADMIN', () => {
    expect(staffJwtClaims(undefined).role).toBe('ADMIN');
    expect(staffJwtClaims(null).roles).toEqual(['ADMIN']);
  });
});
