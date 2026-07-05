import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycAdminOverride } from '../../compliance/kyc-policy/entities/kyc-admin-override.entity';
import { KycTierPolicy } from '../../compliance/kyc-policy/entities/kyc-tier-policy.entity';
import { User } from '../../users/entities/user.entity';
import { AuditService } from '../../audit/audit.service';
import { CreateKycAdminOverrideDto } from '../dto/create-kyc-admin-override.dto';
import { isBypassAllLimitsEffective } from '../../compliance/kyc-policy/kyc-policy.override-effectiveness';

function parseCsvRoles(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

export type AdminJwtPayload = {
  userId: string;
  roles?: string[];
  role?: string;
};

@Injectable()
export class AdminKycPolicyService {
  constructor(
    @InjectRepository(KycAdminOverride)
    private readonly overrideRepo: Repository<KycAdminOverride>,
    @InjectRepository(KycTierPolicy)
    private readonly tierRepo: Repository<KycTierPolicy>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  private get overrideMaxTtlMs(): number {
    const h = parseInt(process.env.KYC_OVERRIDE_MAX_TTL_HOURS || '168', 10);
    return Math.max(1, h) * 60 * 60 * 1000;
  }

  private approverRoleAllowlist(): string[] {
    const fromEnv = parseCsvRoles(process.env.KYC_BYPASS_LIMITS_APPROVER_ROLES);
    if (fromEnv.length > 0) return fromEnv;
    return process.env.NODE_ENV === 'production'
      ? ['SUPER_ADMIN']
      : ['ADMIN', 'SUPER_ADMIN'];
  }

  private assertAdminHasAnyRole(admin: AdminJwtPayload, allowlist: string[]): void {
    const ur: string[] = Array.isArray(admin.roles)
      ? admin.roles
      : admin.role
        ? [admin.role]
        : [];
    if (!allowlist.some((a) => ur.includes(a))) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_OVERRIDE_ROLE',
        message: `One of these roles is required: ${allowlist.join(', ')}`,
      });
    }
  }

  listTierPolicies() {
    return this.tierRepo.find({ order: { tier_key: 'ASC' } });
  }

  async listOverridesForUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.overrideRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Daily / compliance ops: active `bypass_all_limits` that are fully maker-approved,
   * plus requests waiting for second approval.
   */
  async bypassLimitsComplianceReport() {
    const rows = await this.overrideRepo.find({
      where: { active: true, bypass_all_limits: true },
      order: { created_at: 'DESC' },
    });
    const now = Date.now();
    const nonExpired = (r: KycAdminOverride) =>
      !r.expires_at || r.expires_at.getTime() > now;

    return {
      generated_at: new Date().toISOString(),
      effective: rows.filter(
        (r) => nonExpired(r) && isBypassAllLimitsEffective(r),
      ),
      pending_second_approval: rows.filter(
        (r) =>
          nonExpired(r) &&
          Number(r.bypass_limits_maker_version) === 1 &&
          !r.bypass_limits_second_approver_admin_id,
      ),
    };
  }

  async createOverride(
    dto: CreateKycAdminOverrideDto,
    admin: AdminJwtPayload,
  ): Promise<KycAdminOverride> {
    const user = await this.userRepo.findOne({ where: { id: dto.user_id } });
    if (!user) throw new NotFoundException('User not found');

    const bypass = dto.bypass_all_limits ?? false;
    if (bypass) {
      if (!dto.expires_at?.trim()) {
        throw new BadRequestException({
          code: 'KYC_OVERRIDE_EXPIRES_REQUIRED',
          message:
            'expires_at is required when bypass_all_limits is true (strict TTL).',
        });
      }
      const exp = new Date(dto.expires_at);
      const maxUntil = Date.now() + this.overrideMaxTtlMs;
      if (exp.getTime() > maxUntil) {
        throw new BadRequestException({
          code: 'KYC_OVERRIDE_EXPIRES_TOO_FAR',
          message: `expires_at must be within KYC_OVERRIDE_MAX_TTL_HOURS (default 168h).`,
        });
      }
    }

    const row = this.overrideRepo.create({
      user_id: dto.user_id,
      active: true,
      bypass_kyc_status_gate: dto.bypass_kyc_status_gate ?? false,
      bypass_all_limits: bypass,
      bypass_limits_maker_version: bypass ? 1 : 0,
      bypass_limits_second_approver_admin_id: null,
      boost_daily_outflow_mad: dto.boost_daily_outflow_mad ?? 0,
      boost_monthly_outflow_mad: dto.boost_monthly_outflow_mad ?? 0,
      boost_max_single_transfer_mad: dto.boost_max_single_transfer_mad ?? 0,
      boost_daily_withdrawal_mad: dto.boost_daily_withdrawal_mad ?? 0,
      boost_monthly_withdrawal_mad: dto.boost_monthly_withdrawal_mad ?? 0,
      extra_allowed_country_codes: (dto.extra_allowed_country_codes ?? []).map((c) =>
        c.trim().toUpperCase(),
      ),
      reason: dto.reason.trim().slice(0, 2000),
      created_by_admin_user_id: admin.userId,
      expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
    });
    const saved = await this.overrideRepo.save(row);
    await this.auditService.audit({
      actorUserId: admin.userId,
      action: bypass
        ? 'KYC_ADMIN_OVERRIDE_BYPASS_REQUESTED'
        : 'KYC_ADMIN_OVERRIDE_CREATED',
      targetType: 'USER',
      targetId: dto.user_id,
      metadata: {
        override_id: saved.id,
        bypass_kyc_status_gate: saved.bypass_kyc_status_gate,
        bypass_all_limits: saved.bypass_all_limits,
        pending_second_approval: bypass,
      },
    });
    return saved;
  }

  async approveBypassLimits(overrideId: string, admin: AdminJwtPayload) {
    this.assertAdminHasAnyRole(admin, this.approverRoleAllowlist());

    const row = await this.overrideRepo.findOne({ where: { id: overrideId } });
    if (!row) throw new NotFoundException('Override not found');
    if (!row.bypass_all_limits) {
      throw new BadRequestException('Override does not request bypass_all_limits');
    }
    if (Number(row.bypass_limits_maker_version) !== 1) {
      throw new BadRequestException('Maker-checker approval applies to new bypass requests only');
    }
    if (row.bypass_limits_second_approver_admin_id) {
      throw new BadRequestException('Bypass already second-approved');
    }
    if (row.created_by_admin_user_id === admin.userId) {
      throw new ForbiddenException({
        code: 'KYC_OVERRIDE_MAKER_CHECKER_SAME_ADMIN',
        message: 'A different administrator must approve bypass_all_limits.',
      });
    }

    row.bypass_limits_second_approver_admin_id = admin.userId;
    await this.overrideRepo.save(row);
    await this.auditService.audit({
      actorUserId: admin.userId,
      action: 'KYC_ADMIN_OVERRIDE_BYPASS_APPROVED',
      targetType: 'KYC_ADMIN_OVERRIDE',
      targetId: overrideId,
      metadata: { user_id: row.user_id, maker_admin_id: row.created_by_admin_user_id },
    });
    return row;
  }

  async deactivateOverride(overrideId: string, adminUserId: string) {
    const row = await this.overrideRepo.findOne({ where: { id: overrideId } });
    if (!row) throw new NotFoundException('Override not found');
    row.active = false;
    await this.overrideRepo.save(row);
    await this.auditService.audit({
      actorUserId: adminUserId,
      action: 'KYC_ADMIN_OVERRIDE_DEACTIVATED',
      targetType: 'KYC_ADMIN_OVERRIDE',
      targetId: overrideId,
      metadata: { user_id: row.user_id },
    });
    return { id: overrideId, active: false };
  }
}
