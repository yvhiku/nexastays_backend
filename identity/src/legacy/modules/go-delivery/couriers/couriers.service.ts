import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';

/**
 * CouriersService - Manages courier availability
 * Note: Couriers are regular users (core.users) - no separate courier profile table needed for MVP
 * We track courier availability via order assignments
 */
@Injectable()
export class CouriersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Onboard a user as a courier
   * For MVP, we just verify the user exists
   * In production, you might add courier-specific fields (vehicle, documents, etc.)
   */
  async onboardCourier(
    userId: string,
  ): Promise<{ message: string; userId: string }> {
    // Verify user exists
    try {
      await this.usersService.getMe(userId);
    } catch (error) {
      throw new NotFoundException('User not found');
    }

    // For MVP, courier onboarding is just verification
    // In production, you might create a courier_profiles table
    return {
      message: 'Courier onboarded successfully',
      userId,
    };
  }

  /**
   * Get courier by user ID
   */
  async getCourierByUserId(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Courier not found');
    }
    return user;
  }
}
