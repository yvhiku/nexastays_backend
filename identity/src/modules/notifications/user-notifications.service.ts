import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { getHeaderCacheKey } from '../../common/cache/http-cache.interceptor';
import { UserNotification } from './entities/user-notification.entity';

export interface UserNotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

@Injectable()
export class UserNotificationsService {
  constructor(
    @InjectRepository(UserNotification)
    private readonly repo: Repository<UserNotification>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async invalidateHeaderCache(userId: string): Promise<void> {
    try {
      await this.cacheManager.del(getHeaderCacheKey(userId));
    } catch {
      /* ignore cache errors */
    }
  }

  private toDto(row: UserNotification): UserNotificationDto {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: row.data ?? {},
      is_read: row.is_read,
      created_at: row.created_at.toISOString(),
      read_at: row.read_at ? row.read_at.toISOString() : null,
    };
  }

  async list(userId: string, limit = 20): Promise<UserNotificationDto[]> {
    const capped = Math.min(Math.max(limit, 1), 20);
    const rows = await this.repo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: capped,
    });
    return rows.map((r) => this.toDto(r));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { user_id: userId, is_read: false } });
  }

  async markRead(userId: string, notificationId: string): Promise<UserNotificationDto> {
    const row = await this.repo.findOne({
      where: { id: notificationId, user_id: userId },
    });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    if (!row.is_read) {
      row.is_read = true;
      row.read_at = new Date();
      await this.repo.save(row);
      await this.invalidateHeaderCache(userId);
    }
    return this.toDto(row);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { user_id: userId, is_read: false },
      { is_read: true, read_at: new Date() },
    );
    if ((result.affected ?? 0) > 0) {
      await this.invalidateHeaderCache(userId);
    }
    return { updated: result.affected ?? 0 };
  }
}
