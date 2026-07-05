import type { KycAdminOverride } from './entities/kyc-admin-override.entity';

/**
 * `bypass_all_limits` is only effective after maker–checker approval (v1 rows), or for legacy v0 rows.
 */
export function isBypassAllLimitsEffective(row: KycAdminOverride): boolean {
  if (!row.bypass_all_limits) return false;
  const version = Number(row.bypass_limits_maker_version ?? 0);
  if (version === 0) return true;
  const second = row.bypass_limits_second_approver_admin_id;
  const maker = row.created_by_admin_user_id;
  return (
    second != null &&
    maker != null &&
    second !== maker
  );
}
