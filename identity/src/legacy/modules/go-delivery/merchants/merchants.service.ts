import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { MerchantStatus } from '../enums/merchant-status.enum';
import { UsersService } from '../../users/users.service';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Onboard a user as a merchant
   */
  async onboardMerchant(userId: string, name: string): Promise<Merchant> {
    // Check if user is already a merchant
    const existing = await this.merchantRepository.findOne({
      where: { user_id: userId },
    });
    if (existing) {
      // Return existing merchant instead of throwing error
      return existing;
    }

    // Create merchant profile
    const merchant = this.merchantRepository.create({
      user_id: userId,
      name,
      status: MerchantStatus.PENDING,
    });

    return this.merchantRepository.save(merchant);
  }

  /**
   * Get merchant by user ID
   */
  async getMerchantByUserId(userId: string): Promise<Merchant | null> {
    return this.merchantRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });
  }

  /**
   * Get merchant by ID
   */
  async getMerchantById(merchantId: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
      relations: ['user'],
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  /**
   * Get all active merchants
   */
  async getActiveMerchants(): Promise<Merchant[]> {
    return this.merchantRepository.find({
      where: { status: MerchantStatus.ACTIVE },
      relations: ['user'],
    });
  }

  /**
   * List active merchants (alias for getActiveMerchants)
   */
  async listActiveMerchants(): Promise<Merchant[]> {
    return this.getActiveMerchants();
  }

  /**
   * Update merchant status
   */
  async updateMerchantStatus(
    merchantId: string,
    status: MerchantStatus,
  ): Promise<Merchant> {
    const merchant = await this.getMerchantById(merchantId);
    merchant.status = status;
    return this.merchantRepository.save(merchant);
  }
}
