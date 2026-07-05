import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { SubmitWaitlistDto } from './dto/submit-waitlist.dto';
import { AdminWaitlistQueryDto } from './dto/admin-waitlist-query.dto';

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepo: Repository<WaitlistEntry>,
  ) {}

  async submit(dto: SubmitWaitlistDto): Promise<WaitlistEntry> {
    const entry = this.waitlistRepo.create({
      full_name: dto.full_name.trim(),
      phone_number: dto.phone_number.trim(),
      city: dto.city.trim(),
      email: dto.email.trim().toLowerCase(),
      how_will_use_nexa: dto.how_will_use_nexa?.trim() || null,
      source: dto.source?.trim() || 'unknown',
      user_type: dto.user_type?.trim().toLowerCase() || null,
    });
    return this.waitlistRepo.save(entry);
  }

  async findAllForAdmin(query: AdminWaitlistQueryDto): Promise<{
    data: WaitlistEntry[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const source = query.source?.trim();
    const rawUserType = query.user_type;
    const userType = rawUserType?.trim().toLowerCase();

    const qb = this.waitlistRepo.createQueryBuilder('waitlist');
    if (source) {
      qb.andWhere('waitlist.source = :source', { source });
    }
    if (rawUserType === '') {
      qb.andWhere('(waitlist.user_type IS NULL OR waitlist.user_type = \'\')');
    } else if (userType) {
      qb.andWhere('waitlist.user_type = :userType', { userType });
    }

    const [data, total] = await qb
      .orderBy('waitlist.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit) || 1,
    };
  }
}
