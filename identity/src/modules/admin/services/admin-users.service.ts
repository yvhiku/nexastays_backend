import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { TrustedDevice } from '../../auth/entities/trusted-device.entity';
import { RiskAlert } from '../entities/risk-alert.entity';
import { AdminUsersQueryDto } from '../dto/admin-users.query.dto';
import { AdminAuditService } from './admin-audit.service';

interface RequestUser {
  userId?: string;
  email?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletsRepository: Repository<Wallet>,
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepository: Repository<TrustedDevice>,
    @InjectRepository(RiskAlert)
    private readonly riskAlertRepository: Repository<RiskAlert>,
    private readonly auditService: AdminAuditService,
  ) {}

  private applyUsersListFilters(
    qb: SelectQueryBuilder<User>,
    query: AdminUsersQueryDto,
  ) {
    if (query.status && query.status !== 'all') {
      qb.andWhere('u.status = :status', { status: query.status });
    }

    if (query.kyc && query.kyc !== 'all') {
      if (query.kyc === 'UNVERIFIED') {
        qb.andWhere('(k.status = :kyc OR k.status IS NULL)', {
          kyc: query.kyc,
        });
      } else {
        qb.andWhere('k.status = :kyc', { kyc: query.kyc });
      }
    }

    if (query.account_type && query.account_type !== 'all') {
      qb.andWhere('u.account_type = :account_type', {
        account_type: query.account_type,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(u.phone_number ILIKE :search OR u.full_name ILIKE :search OR u.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
  }

  async getUsers(query: AdminUsersQueryDto) {
    const limit = Math.min(Number(query.limit) || 50, 500);
    const page = Math.max(1, Number(query.page) || 1);

    const countQb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.kyc_profile', 'k');
    this.applyUsersListFilters(countQb, query);
    countQb.select('COUNT(DISTINCT u.id)', 'cnt');
    const cntRow = await countQb.getRawOne<{ cnt?: string }>();
    const total = Number(cntRow?.cnt ?? 0);

    const qb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.kyc_profile', 'k')
      .select([
        'u.id as id',
        'u.phone_number as phone_number',
        'u.full_name as full_name',
        'u.email as email',
        'u.city as city',
        'u.account_type as account_type',
        'u.linked_user_id as linked_user_id',
        'u.status as account_status',
        'u.risk_score as risk_score',
        'u.created_at as created_at',
        'u.last_login_at as last_login_at',
        "COALESCE(k.status, u.kyc_status, 'UNVERIFIED') as kyc_status",
      ])
      .orderBy('u.created_at', 'DESC');

    this.applyUsersListFilters(qb, query);

    qb.take(limit).skip((page - 1) * limit);

    const rows = await qb.getRawMany();
    const data = rows.map((row) => ({
      id: row.id,
      phone_number: row.phone_number,
      full_name: row.full_name,
      email: row.email,
      city: row.city ?? null,
      account_type: row.account_type || 'CONSUMER',
      linked_user_id: row.linked_user_id ?? null,
      kyc_status: row.kyc_status || 'UNVERIFIED',
      wallet_id: null,
      balance: 0,
      risk_score: Number(row.risk_score || 0),
      account_status: row.account_status,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    }));

    const total_pages = Math.max(1, Math.ceil(total / limit));

    return {
      data,
      total,
      page,
      limit,
      total_pages,
    };
  }

  async inviteAdmin(email: string, role: string) {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email is required');
    }
    return {
      success: true,
      message: 'Invite sent (stub). Implement email delivery and pending admin record.',
      email: email.trim(),
      role: role || 'ADMIN',
    };
  }

  /**
   * Check driver and courier accounts for linked consumer accounts
   */
  async checkDriverCourierConsumerAccounts() {
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.linked_user', 'linked')
      .select([
        'u.id as id',
        'u.phone_number as phone_number',
        'u.full_name as full_name',
        'u.account_type as account_type',
        'u.linked_user_id as linked_user_id',
        'linked.id as linked_consumer_id',
        'linked.full_name as linked_consumer_name',
        'linked.phone_number as linked_consumer_phone',
        'linked.account_type as linked_account_type',
      ])
      .where('u.account_type IN (:...types)', { types: ['DRIVER', 'COURIER'] })
      .orderBy('u.account_type', 'ASC')
      .addOrderBy('u.full_name', 'ASC');

    const rows = await qb.getRawMany();

    // Also check for potential auto-links (same phone number)
    const accountsWithoutLink = rows.filter((r) => !r.linked_user_id);
    const potentialLinks: Array<{
      driver_courier_id: any;
      driver_courier_name: any;
      driver_courier_phone: any;
      account_type: any;
      potential_consumer_id: string;
      potential_consumer_name: string;
      potential_consumer_phone: string;
    }> = [];

    for (const account of accountsWithoutLink) {
      const consumer = await this.usersRepository.findOne({
        where: {
          phone_number: account.phone_number,
          account_type: 'CONSUMER',
        },
        select: ['id', 'full_name', 'phone_number'],
      });

      if (consumer) {
        potentialLinks.push({
          driver_courier_id: account.id,
          driver_courier_name: account.full_name,
          driver_courier_phone: account.phone_number,
          account_type: account.account_type,
          potential_consumer_id: consumer.id,
          potential_consumer_name: consumer.full_name,
          potential_consumer_phone: consumer.phone_number ?? '',
        });
      }
    }

    // Summary statistics
    const summary = {
      total_drivers: rows.filter((r) => r.account_type === 'DRIVER').length,
      drivers_with_link: rows.filter(
        (r) => r.account_type === 'DRIVER' && r.linked_user_id,
      ).length,
      drivers_without_link: rows.filter(
        (r) => r.account_type === 'DRIVER' && !r.linked_user_id,
      ).length,
      total_couriers: rows.filter((r) => r.account_type === 'COURIER').length,
      couriers_with_link: rows.filter(
        (r) => r.account_type === 'COURIER' && r.linked_user_id,
      ).length,
      couriers_without_link: rows.filter(
        (r) => r.account_type === 'COURIER' && !r.linked_user_id,
      ).length,
      potential_auto_links: potentialLinks.length,
    };

    return {
      accounts: rows.map((row) => ({
        id: row.id,
        phone_number: row.phone_number,
        full_name: row.full_name,
        account_type: row.account_type,
        linked_user_id: row.linked_user_id,
        linked_consumer: row.linked_consumer_id
          ? {
              id: row.linked_consumer_id,
              full_name: row.linked_consumer_name,
              phone_number: row.linked_consumer_phone,
              account_type: row.linked_account_type,
            }
          : null,
        has_linked_consumer: !!row.linked_user_id,
        has_valid_consumer_link:
          row.linked_user_id && row.linked_account_type === 'CONSUMER',
      })),
      potential_auto_links: potentialLinks,
      summary,
    };
  }

  async getUser(id: string) {
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .leftJoin('u.kyc_profile', 'k')
      .leftJoin('u.linked_user', 'lu')
      .select([
        'u.id as id',
        'u.phone_number as phone_number',
        'u.full_name as full_name',
        'u.email as email',
        'u.city as city',
        'u.date_of_birth as date_of_birth',
        'u.nationality as nationality',
        'u.account_type as account_type',
        'u.linked_user_id as linked_user_id',
        'u.status as account_status',
        'u.risk_score as risk_score',
        'u.created_at as created_at',
        'u.last_login_at as last_login_at',
        "COALESCE(k.status, u.kyc_status, 'UNVERIFIED') as kyc_status",
        'lu.id as linked_id',
        'lu.full_name as linked_full_name',
        'lu.phone_number as linked_phone_number',
      ])
      .where('u.id = :id', { id });

    const row = await qb.getRawOne();
    if (!row) {
      throw new NotFoundException('User not found');
    }

    const linked_user =
      row.linked_id != null
        ? {
            id: row.linked_id,
            full_name: row.linked_full_name,
            phone_number: row.linked_phone_number,
          }
        : null;

    const dob = row.date_of_birth;
    const dobStr =
      dob instanceof Date
        ? dob.toISOString().slice(0, 10)
        : dob != null
          ? String(dob).slice(0, 10)
          : null;

    return {
      id: row.id,
      phone_number: row.phone_number,
      full_name: row.full_name,
      email: row.email,
      date_of_birth: dobStr,
      nationality: row.nationality ?? null,
      account_type: row.account_type || 'CONSUMER',
      linked_user_id: row.linked_user_id ?? null,
      linked_user,
      kyc_status: row.kyc_status || 'UNVERIFIED',
      wallet_id: null,
      balance: 0,
      risk_score: Number(row.risk_score || 0),
      account_status: row.account_status,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    };
  }

  async updateStatus(id: string, status: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = status;
    await this.usersRepository.save(user);

    await this.auditService.logAction({
      action: 'USER_STATUS_UPDATED',
      entityType: 'user',
      entityId: id,
      userId: id,
      metadata: { status },
      adminUser,
    });

    return { success: true };
  }

  async freezeUser(userId: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = 'FROZEN';
    await this.usersRepository.save(user);

    const wallet = await this.walletsRepository.findOne({
      where: { user_id: userId },
    });
    if (wallet) {
      wallet.status = 'LOCKED';
      await this.walletsRepository.save(wallet);
    }

    await this.auditService.logAction({
      action: 'WALLET_FROZEN',
      entityType: 'wallet',
      entityId: wallet?.id,
      userId: userId,
      adminUser,
    });

    return { success: true };
  }

  async unfreezeUser(userId: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = 'ACTIVE';
    await this.usersRepository.save(user);

    const wallet = await this.walletsRepository.findOne({
      where: { user_id: userId },
    });
    if (wallet) {
      wallet.status = 'ACTIVE';
      await this.walletsRepository.save(wallet);
    }

    await this.auditService.logAction({
      action: 'WALLET_UNFROZEN',
      entityType: 'wallet',
      entityId: wallet?.id,
      userId: userId,
      adminUser,
    });

    return { success: true };
  }

  async getUserWallet(id: string) {
    const wallet = await this.walletsRepository.findOne({
      where: { user_id: id },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async getUserKyc(id: string) {
    const kyc = await this.kycRepository.findOne({ where: { user_id: id } });
    if (!kyc) {
      throw new NotFoundException('KYC profile not found');
    }
    return kyc;
  }

  async forceLogoutUser(userId: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update()
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
    await this.auditService.logAction({
      action: 'USER_FORCE_LOGOUT',
      entityType: 'user',
      entityId: userId,
      userId,
      adminUser,
    });
    return { success: true };
  }

  async untrustDevice(userId: string, deviceId: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const row = await this.trustedDeviceRepository.findOne({
      where: { user_id: userId, device_id: deviceId },
    });
    if (!row) throw new NotFoundException('Trusted device not found');
    row.trusted = false;
    row.last_seen_at = new Date();
    await this.trustedDeviceRepository.save(row);
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update()
      .set({ revoked_at: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('device_id = :deviceId', { deviceId })
      .andWhere('revoked_at IS NULL')
      .execute();
    await this.auditService.logAction({
      action: 'DEVICE_UNTRUSTED_BY_ADMIN',
      entityType: 'trusted_device',
      entityId: row.id,
      userId,
      metadata: { deviceId },
      adminUser,
    });
    return { success: true };
  }

  async triggerStepUp(userId: string, reason: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.riskAlertRepository.save({
      type: 'MANUAL_STEP_UP_REQUIRED',
      severity: 'MEDIUM',
      user_id: userId,
      transaction_id: null,
      description: reason || 'Manual step-up auth required by admin',
      risk_score: 60,
      status: 'OPEN',
    });
    await this.auditService.logAction({
      action: 'STEP_UP_FORCED_BY_ADMIN',
      entityType: 'user',
      entityId: userId,
      userId,
      metadata: { reason },
      adminUser,
    });
    return { success: true };
  }

  async addComplianceTag(userId: string, tag: string, adminUser?: RequestUser) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.riskAlertRepository.save({
      type: `USER_TAG_${tag.toUpperCase()}`,
      severity: 'MEDIUM',
      user_id: userId,
      transaction_id: null,
      description: `Compliance tag applied: ${tag}`,
      risk_score: 55,
      status: 'OPEN',
    });
    await this.auditService.logAction({
      action: 'COMPLIANCE_TAG_ADDED',
      entityType: 'user',
      entityId: userId,
      userId,
      metadata: { tag },
      adminUser,
    });
    return { success: true };
  }
}
