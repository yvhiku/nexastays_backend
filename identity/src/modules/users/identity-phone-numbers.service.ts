import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IdentityPhoneNumber } from './entities/identity-phone-number.entity';
import { UnifiedIdentity } from './entities/unified-identity.entity';
import {
  normalizePhoneNumber,
  tryNormalizePhoneNumber,
} from '../../common/phone/phone-normalizer';

@Injectable()
export class IdentityPhoneNumbersService {
  constructor(
    @InjectRepository(IdentityPhoneNumber)
    private readonly repo: Repository<IdentityPhoneNumber>,
    @InjectRepository(UnifiedIdentity)
    private readonly identityRepo: Repository<UnifiedIdentity>,
  ) {}

  /**
   * Normalize phone to E.164. Re-export for convenience.
   */
  normalizePhoneNumber(raw: string): string {
    return normalizePhoneNumber(raw);
  }

  /** Try to normalize; returns null on failure. */
  tryNormalize(raw: string): string | null {
    return tryNormalizePhoneNumber(raw);
  }

  /**
   * Find identity by phone (via identity_phone_numbers).
   * Normalizes input before lookup. Returns null if not found.
   */
  async findIdentityByPhone(rawPhone: string): Promise<UnifiedIdentity | null> {
    const normalized = tryNormalizePhoneNumber(rawPhone);
    if (!normalized) return null;
    const row = await this.repo.findOne({
      where: { normalized_phone_number: normalized },
      relations: ['identity'],
    });
    return row?.identity ?? null;
  }

  /**
   * Find identity id by phone. Returns null if not found.
   */
  async findIdentityIdByPhone(rawPhone: string): Promise<string | null> {
    const normalized = tryNormalizePhoneNumber(rawPhone);
    if (!normalized) return null;
    const row = await this.repo.findOne({
      where: { normalized_phone_number: normalized },
      select: ['identity_id'],
    });
    return row?.identity_id ?? null;
  }

  /**
   * Attach a phone number to an identity.
   * Normalizes before storing. If number already linked to another identity, throws Conflict.
   * @param manager - Optional. When inside a transaction, pass the EntityManager so the identity
   *   lookup can see uncommitted rows (e.g. a freshly created unified_identity).
   */
  async attachPhoneNumberToIdentity(
    identityId: string,
    rawPhone: string,
    options?: { isPrimary?: boolean; isVerified?: boolean },
    manager?: EntityManager,
  ): Promise<IdentityPhoneNumber> {
    const identityRepo = manager
      ? manager.getRepository(UnifiedIdentity)
      : this.identityRepo;
    const repo = manager ? manager.getRepository(IdentityPhoneNumber) : this.repo;

    const identity = await identityRepo.findOne({
      where: { id: identityId },
    });
    if (!identity) {
      throw new NotFoundException('Identity not found');
    }
    const normalized = normalizePhoneNumber(rawPhone);
    const existing = await repo.findOne({
      where: { normalized_phone_number: normalized },
    });
    if (existing) {
      if (existing.identity_id === identityId) {
        return existing;
      }
      throw new ConflictException(
        'This phone number is already linked to another identity',
      );
    }
    const isFirst = (await repo.count({ where: { identity_id: identityId } })) === 0;
    const isPrimary = options?.isPrimary ?? isFirst;
    const isVerified = options?.isVerified ?? false;
    if (isPrimary) {
      await repo.update(
        { identity_id: identityId },
        { is_primary: false },
      );
    }
    const row = repo.create({
      identity_id: identityId,
      phone_number: rawPhone,
      normalized_phone_number: normalized,
      is_primary: isPrimary,
      is_verified: isVerified,
      verified_at: isVerified ? new Date() : null,
    });
    try {
      return await repo.save(row);
    } catch (e: any) {
      if (e?.code === '23505') {
        const existingRow = await repo.findOne({
          where: { normalized_phone_number: normalized },
        });
        if (existingRow?.identity_id === identityId) {
          return existingRow;
        }
        throw new ConflictException(
          'This phone number is already linked to another identity',
        );
      }
      throw e;
    }
  }

  /**
   * Set the primary phone number for an identity.
   */
  async setPrimaryPhoneNumber(
    identityId: string,
    rawPhone: string,
  ): Promise<IdentityPhoneNumber> {
    const normalized = normalizePhoneNumber(rawPhone);
    const row = await this.repo.findOne({
      where: {
        identity_id: identityId,
        normalized_phone_number: normalized,
      },
    });
    if (!row) {
      throw new NotFoundException(
        'Phone number not found for this identity',
      );
    }
    await this.repo.update(
      { identity_id: identityId },
      { is_primary: false },
    );
    row.is_primary = true;
    return this.repo.save(row);
  }

  /**
   * Mark a phone number as verified.
   */
  async verifyPhoneNumber(
    identityId: string,
    rawPhone: string,
  ): Promise<IdentityPhoneNumber> {
    const normalized = normalizePhoneNumber(rawPhone);
    const row = await this.repo.findOne({
      where: {
        identity_id: identityId,
        normalized_phone_number: normalized,
      },
    });
    if (!row) {
      throw new NotFoundException(
        'Phone number not found for this identity',
      );
    }
    row.is_verified = true;
    row.verified_at = new Date();
    return this.repo.save(row);
  }

  /**
   * Get primary phone for an identity, or first phone if none primary.
   */
  async getPrimaryPhone(identityId: string): Promise<string | null> {
    const primary = await this.repo.findOne({
      where: { identity_id: identityId, is_primary: true },
      select: ['phone_number'],
    });
    if (primary) return primary.phone_number;
    const first = await this.repo.findOne({
      where: { identity_id: identityId },
      order: { created_at: 'ASC' },
      select: ['phone_number'],
    });
    return first?.phone_number ?? null;
  }
}
