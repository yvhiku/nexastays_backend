import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnifiedIdentity } from './entities/unified-identity.entity';
import { User } from './entities/user.entity';
import {
  SharedField,
  NexaService,
  PROFILE_SYNC_RULES,
  getFieldRule,
  isSharedField,
  canWriteFromService,
  ConflictStrategy,
} from './profile-sync-policy';
import { AuditService } from '../audit/audit.service';
import type { Request } from 'express';

export interface SharedProfileUpdate {
  full_name?: string | null;
  email?: string | null;
  date_of_birth?: Date | string | null;
  city?: string | null;
  address?: string | null;
  profile_photo_url?: string | null;
  preferred_language?: string | null;
}

export interface ProfileSyncOptions {
  service: NexaService;
  userId: string;
  unifiedIdentityId: string;
  profileLocked?: boolean;
  identityVerified?: boolean;
  auditParams?: {
    actorUserId: string;
    actorRole?: string;
    req?: Request | null;
  };
}

export interface SyncResult {
  updated: boolean;
  unifiedIdentityUpdated: boolean;
  usersPropagated: number;
  fieldsUpdated: string[];
  fieldsSkipped: string[];
  conflicts: { field: SharedField; reason: string }[];
}

@Injectable()
export class ProfileSyncService {
  constructor(
    @InjectRepository(UnifiedIdentity)
    private readonly unifiedRepo: Repository<UnifiedIdentity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Update shared profile fields. Writes to UnifiedIdentity (source of truth), then propagates to linked users.
   * Validates writable_from_services, requires_verification (locked fields), conflict_strategy.
   */
  async updateSharedProfile(
    updates: SharedProfileUpdate,
    options: ProfileSyncOptions,
  ): Promise<SyncResult> {
    const identity = await this.unifiedRepo.findOne({
      where: { id: options.unifiedIdentityId },
    });
    if (!identity) {
      throw new NotFoundException('Unified identity not found');
    }

    const fieldsUpdated: string[] = [];
    const fieldsSkipped: string[] = [];
    const conflicts: { field: SharedField; reason: string }[] = [];

    const payload: Partial<UnifiedIdentity> = {};
    const lockedFields = options.profileLocked
      ? ['full_name', 'date_of_birth']
      : [];

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (!isSharedField(key)) {
        fieldsSkipped.push(`${key} (not a shared field)`);
        continue;
      }

      const rule = getFieldRule(key);
      if (!canWriteFromService(key, options.service)) {
        fieldsSkipped.push(`${key} (service not allowed)`);
        continue;
      }
      if (rule.requires_verification && lockedFields.includes(key)) {
        fieldsSkipped.push(`${key} (locked by KYC)`);
        conflicts.push({ field: key, reason: 'FIELD_LOCKED_KYC' });
        continue;
      }

      let valueToStore = value;
      if (key === 'date_of_birth' && typeof value === 'string') {
        valueToStore = new Date(value);
      }
      const currentValue = (identity as unknown as Record<string, unknown>)[key];
      const strategy = this.resolveConflict(
        key,
        currentValue,
        valueToStore,
        identity.identity_verified ?? false,
        rule.conflict_strategy,
      );
      if (strategy === 'SKIP') {
        fieldsSkipped.push(`${key} (conflict: ${rule.conflict_strategy})`);
        conflicts.push({ field: key, reason: `CONFLICT_${rule.conflict_strategy}` });
        continue;
      }

      (payload as Record<string, unknown>)[key] = valueToStore;
      fieldsUpdated.push(key);
    }

    let unifiedIdentityUpdated = false;
    if (Object.keys(payload).length > 0) {
      await this.unifiedRepo.update(options.unifiedIdentityId, {
        ...payload,
        updated_at: new Date(),
      });
      unifiedIdentityUpdated = true;

      for (const field of fieldsUpdated) {
        const rule = getFieldRule(field as SharedField);
        if (rule.audit_required && options.auditParams) {
          await this.auditService.audit({
            actorUserId: options.auditParams.actorUserId,
            actorRole: options.auditParams.actorRole ?? undefined,
            action: 'PROFILE_SYNC_UPDATE',
            targetType: 'unified_identity',
            targetId: options.unifiedIdentityId,
            metadata: {
              field,
              service: options.service,
              unifiedIdentityId: options.unifiedIdentityId,
            },
            req: options.auditParams.req ?? undefined,
          });
        }
      }
    }

    const usersPropagated = await this.propagateToUsers(
      options.unifiedIdentityId,
      payload,
    );

    return {
      updated: fieldsUpdated.length > 0,
      unifiedIdentityUpdated,
      usersPropagated,
      fieldsUpdated,
      fieldsSkipped,
      conflicts,
    };
  }

  /**
   * Propagate shared fields from UnifiedIdentity to all linked users (cache refresh).
   */
  async syncFromUnifiedToUsers(unifiedIdentityId: string): Promise<number> {
    const identity = await this.unifiedRepo.findOne({
      where: { id: unifiedIdentityId },
    });
    if (!identity) return 0;

    const payload: Partial<User> = {};
    const userFields = ['full_name', 'email', 'city', 'date_of_birth', 'profile_photo_url'] as const;
    for (const f of userFields) {
      const idRec = identity as unknown as Record<string, unknown>;
      if (idRec[f] !== undefined) {
        (payload as Record<string, unknown>)[f] = idRec[f];
      }
    }
    if (Object.keys(payload).length === 0) return 0;
    return this.propagateToUsers(unifiedIdentityId, payload);
  }

  /**
   * Resolve conflict between current and incoming value.
   * Returns 'APPLY' to apply the update, 'SKIP' to skip.
   */
  private resolveConflict(
    field: SharedField,
    current: unknown,
    incoming: unknown,
    identityVerified: boolean,
    strategy: ConflictStrategy,
  ): 'APPLY' | 'SKIP' {
    const currentEmpty = current == null || current === '';
    const incomingEmpty = incoming == null || incoming === '';

    if (incomingEmpty && !currentEmpty) return 'SKIP';
    if (currentEmpty) return 'APPLY';

    switch (strategy) {
      case 'UNIFIED_WINS':
        return 'APPLY';
      case 'NO_OVERWRITE':
        return 'SKIP';
      case 'LATEST_WINS':
        return 'APPLY';
      case 'VERIFIED_WINS':
        return identityVerified ? 'APPLY' : 'SKIP';
      case 'MANUAL_RESOLVE':
        return 'SKIP';
      default:
        return 'APPLY';
    }
  }

  private async propagateToUsers(
    unifiedIdentityId: string,
    payload: Partial<UnifiedIdentity> | Partial<User>,
  ): Promise<number> {
    const userPayload: Partial<User> = {};
    const allowed = ['full_name', 'email', 'city', 'date_of_birth', 'profile_photo_url'];
    for (const k of allowed) {
      const v = (payload as Record<string, unknown>)[k];
      if (v !== undefined) (userPayload as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(userPayload).length === 0) return 0;

    const result = await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ ...userPayload, updated_at: new Date() })
      .where('unified_identity_id = :id', { id: unifiedIdentityId })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Check if a field can be written from the given service.
   */
  canWrite(field: SharedField, service: NexaService): boolean {
    return canWriteFromService(field, service);
  }

  /**
   * Check if a field requires verification (KYC lock).
   */
  isFieldLockedAfterKyc(field: SharedField): boolean {
    return PROFILE_SYNC_RULES[field].requires_verification;
  }
}
