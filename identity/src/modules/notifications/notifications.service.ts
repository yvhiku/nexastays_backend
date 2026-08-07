import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PushDeviceToken } from './entities/push-device-token.entity';
import { safeLogger } from '../../common/logging/safe-logger';

interface PushPayload {
  title: string;
  body: string;
  reference: string;
  amount: string;
  direction: string;
  event: string;
}

@Injectable()
export class NotificationsService {
  private firebaseApp: App | null = null;

  constructor(
    @InjectRepository(PushDeviceToken)
    private readonly pushTokenRepository: Repository<PushDeviceToken>,
  ) {
    this.initializeFirebaseAdmin();
  }

  private initializeFirebaseAdmin(): void {
    const existingApp = getApps()[0];
    if (existingApp) {
      this.firebaseApp = existingApp;
      return;
    }
    try {
      const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
      const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
      if (!serviceAccountJson && !serviceAccountPath) {
        safeLogger.info('FCM disabled: missing service account env');
        return;
      }
      let serviceAccount: ServiceAccount;
      if (serviceAccountJson) {
        serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      } else {
        serviceAccount = require(serviceAccountPath!) as ServiceAccount;
      }
      this.firebaseApp = initializeApp({ credential: cert(serviceAccount) });
      safeLogger.info('FCM initialized');
    } catch (error) {
      safeLogger.error('FCM initialization failed', error);
    }
  }

  async registerPushToken(params: {
    userId: string;
    deviceId: string;
    token: string;
    platform?: string;
    notificationsEnabled?: boolean;
  }): Promise<void> {
    const deviceId = params.deviceId.trim().slice(0, 120);
    if (!deviceId || !params.token) return;
    const existing = await this.pushTokenRepository.findOne({
      where: { user_id: params.userId, device_id: deviceId },
    });
    const now = new Date();
    if (!existing) {
      await this.pushTokenRepository.save({
        user_id: params.userId,
        device_id: deviceId,
        token: params.token,
        platform: (params.platform || 'unknown').slice(0, 20),
        notifications_enabled: params.notificationsEnabled ?? true,
        active: true,
        last_seen_at: now,
      });
      return;
    }
    existing.token = params.token;
    existing.platform = (
      params.platform ||
      existing.platform ||
      'unknown'
    ).slice(0, 20);
    existing.notifications_enabled =
      params.notificationsEnabled ?? existing.notifications_enabled;
    existing.active = true;
    existing.last_seen_at = now;
    await this.pushTokenRepository.save(existing);
  }

  async deactivatePushToken(params: {
    userId: string;
    deviceId?: string | null;
    token?: string | null;
  }): Promise<void> {
    const qb = this.pushTokenRepository
      .createQueryBuilder()
      .update(PushDeviceToken)
      .set({ active: false });
    qb.where('user_id = :userId', { userId: params.userId });
    if (params.deviceId)
      qb.andWhere('device_id = :deviceId', { deviceId: params.deviceId });
    if (params.token) qb.andWhere('token = :token', { token: params.token });
    await qb.execute();
  }

  async updateNotificationPreference(params: {
    userId: string;
    enabled: boolean;
    deviceId?: string | null;
  }): Promise<void> {
    const qb = this.pushTokenRepository
      .createQueryBuilder()
      .update(PushDeviceToken)
      .set({ notifications_enabled: params.enabled });
    qb.where('user_id = :userId', { userId: params.userId });
    if (params.deviceId)
      qb.andWhere('device_id = :deviceId', { deviceId: params.deviceId });
    await qb.execute();
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.firebaseApp) return;
    const rows = await this.pushTokenRepository.find({
      where: { user_id: userId, active: true, notifications_enabled: true },
    });
    const tokens = rows.map((r) => r.token).filter(Boolean);
    if (!tokens.length) return;
    try {
      const response = await getMessaging(
        this.firebaseApp,
      ).sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          reference: payload.reference,
          amount: payload.amount,
          direction: payload.direction,
          event: payload.event,
        },
      });
      if (response.failureCount > 0) {
        safeLogger.error('FCM partial failure', null, {
          userId,
          failures: response.failureCount,
        });
      }
    } catch (error) {
      safeLogger.error('FCM send failed', error, {
        userId,
        event: payload.event,
      });
    }
  }
}
