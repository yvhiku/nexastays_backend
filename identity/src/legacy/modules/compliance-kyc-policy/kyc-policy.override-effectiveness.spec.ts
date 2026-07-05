import { isBypassAllLimitsEffective } from './kyc-policy.override-effectiveness';
import type { KycAdminOverride } from './entities/kyc-admin-override.entity';

function row(p: Partial<KycAdminOverride>): KycAdminOverride {
  return p as KycAdminOverride;
}

describe('isBypassAllLimitsEffective', () => {
  it('returns false when bypass_all_limits is false', () => {
    expect(
      isBypassAllLimitsEffective(
        row({
          bypass_all_limits: false,
          bypass_limits_maker_version: 1,
          created_by_admin_user_id: 'a',
          bypass_limits_second_approver_admin_id: 'b',
        }),
      ),
    ).toBe(false);
  });

  it('allows legacy maker_version 0 without second approver', () => {
    expect(
      isBypassAllLimitsEffective(
        row({
          bypass_all_limits: true,
          bypass_limits_maker_version: 0,
          created_by_admin_user_id: 'a',
          bypass_limits_second_approver_admin_id: null,
        }),
      ),
    ).toBe(true);
  });

  it('requires distinct second approver for maker_version 1', () => {
    expect(
      isBypassAllLimitsEffective(
        row({
          bypass_all_limits: true,
          bypass_limits_maker_version: 1,
          created_by_admin_user_id: 'a',
          bypass_limits_second_approver_admin_id: null,
        }),
      ),
    ).toBe(false);
    expect(
      isBypassAllLimitsEffective(
        row({
          bypass_all_limits: true,
          bypass_limits_maker_version: 1,
          created_by_admin_user_id: 'a',
          bypass_limits_second_approver_admin_id: 'a',
        }),
      ),
    ).toBe(false);
    expect(
      isBypassAllLimitsEffective(
        row({
          bypass_all_limits: true,
          bypass_limits_maker_version: 1,
          created_by_admin_user_id: 'a',
          bypass_limits_second_approver_admin_id: 'b',
        }),
      ),
    ).toBe(true);
  });
});
