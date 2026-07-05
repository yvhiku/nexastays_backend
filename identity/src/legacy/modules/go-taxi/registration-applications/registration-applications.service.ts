import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RegistrationApplication } from '../entities/registration-application.entity';
import {
  detectImageType,
  type AllowedImageType,
} from '../../compliance/image-type.util';
import { UsersService } from '../../users/users.service';
import { UnifiedIdentityService } from '../../users/unified-identity.service';
import { normalizePhoneOrThrow, tryNormalizePhoneNumber } from '../../../common/phone/phone-normalizer';
import { DriversService } from '../drivers/drivers.service';
import { VehicleType } from '../enums/vehicle-type.enum';
import { DriverStatus } from '../enums/driver-status.enum';

const UPLOAD_DIR = 'uploads/go/registrations';
export const REGISTRATION_UPLOAD_DIR = UPLOAD_DIR;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class RegistrationApplicationsService {
  constructor(
    @InjectRepository(RegistrationApplication)
    private readonly repo: Repository<RegistrationApplication>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly unifiedIdentityService: UnifiedIdentityService,
    private readonly driversService: DriversService,
  ) {}

  private validateImageFile(file: Express.Multer.File | undefined): void {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Invalid file: not a valid JPEG, PNG, or WebP image',
      );
    }
  }

  private getExtension(detected: AllowedImageType): string {
    if (detected === 'png') return '.png';
    if (detected === 'webp') return '.webp';
    return '.jpg';
  }

  private parseDate(v: unknown): Date | null {
    if (!v || typeof v !== 'string') return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  async submit(data: {
    role: string;
    fullName?: string;
    phoneNumber: string;
    countryCode?: string;
    email?: string;
    dateOfBirth?: string;
    city?: string;
    address?: string;
    emergencyContact?: string;
    identityDocumentType?: string;
    identityReused?: boolean;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    vehicleColor?: string;
    licensePlate?: string;
    vehicleCategory?: string;
    driversLicenseExpiry?: string;
    vehicleRegistrationExpiry?: string;
    insuranceExpiry?: string;
    vehiclePhotos?: Record<string, string>;
  }, files: {
    identity_front?: Express.Multer.File[];
    identity_back?: Express.Multer.File[];
    selfie?: Express.Multer.File[];
    drivers_license?: Express.Multer.File[];
    vehicle_registration?: Express.Multer.File[];
    insurance?: Express.Multer.File[];
    background_check?: Express.Multer.File[];
    vehicle_photos?: Express.Multer.File[];
  }): Promise<{ id: string; status: string }> {
    const role = (data.role || 'driver').toLowerCase();
    if (role !== 'driver' && role !== 'courier') {
      throw new BadRequestException('role must be driver or courier');
    }
    const raw = String(data.phoneNumber || '').trim();
    if (!raw) {
      throw new BadRequestException('phoneNumber is required');
    }
    const phoneNumber = normalizePhoneOrThrow(raw);

    const identityReused = data.identityReused === true && role === 'courier';
    const app = this.repo.create({
      role,
      status: 'PENDING',
      full_name: data.fullName || null,
      phone_number: phoneNumber,
      country_code: data.countryCode || '+212',
      email: data.email || null,
      date_of_birth: this.parseDate(data.dateOfBirth),
      city: data.city || null,
      address: data.address || null,
      emergency_contact: data.emergencyContact || null,
      identity_document_type: data.identityDocumentType || null,
      vehicle_make: role === 'driver' ? (data.vehicleMake || null) : null,
      vehicle_model: role === 'driver' ? (data.vehicleModel || null) : null,
      vehicle_year:
        role === 'driver' && data.vehicleYear != null ? data.vehicleYear : null,
      vehicle_color: role === 'driver' ? (data.vehicleColor || null) : null,
      license_plate: role === 'driver' ? (data.licensePlate || null) : null,
      vehicle_category:
        role === 'driver' ? (data.vehicleCategory || null) : null,
      drivers_license_expiry:
        role === 'driver' ? this.parseDate(data.driversLicenseExpiry) : null,
      vehicle_registration_expiry:
        role === 'driver'
          ? this.parseDate(data.vehicleRegistrationExpiry)
          : null,
      insurance_expiry:
        role === 'driver' ? this.parseDate(data.insuranceExpiry) : null,
      vehicle_photos: role === 'driver' ? (data.vehiclePhotos || {}) : {},
    });
    await this.repo.save(app);
    const dir = path.join(UPLOAD_DIR, app.id);
    await fs.mkdir(dir, { recursive: true });

    const saveFile = async (
      fileArray: Express.Multer.File[] | undefined,
      prefix: string,
    ): Promise<string | null> => {
      const file = fileArray?.[0];
      if (!file) return null;
      this.validateImageFile(file);
      const detected = detectImageType(file.buffer)!;
      const ext = this.getExtension(detected);
      const filename = `${prefix}_${randomUUID()}${ext}`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, file.buffer);
      return `${app.id}/${filename}`;
    };

    if (!identityReused) {
      app.identity_front_path =
        (await saveFile(files.identity_front, 'identity_front')) || null;
      app.identity_back_path =
        (await saveFile(files.identity_back, 'identity_back')) || null;
      app.selfie_path =
        (await saveFile(files.selfie, 'selfie')) || null;
    }

    if (role === 'driver') {
      app.drivers_license_path =
        (await saveFile(files.drivers_license, 'drivers_license')) || null;
      app.vehicle_registration_path =
        (await saveFile(files.vehicle_registration, 'vehicle_registration')) ||
        null;
      app.insurance_path =
        (await saveFile(files.insurance, 'insurance')) || null;
      app.background_check_path =
        (await saveFile(files.background_check, 'background_check')) || null;

      const vehiclePhotoFiles = files.vehicle_photos || [];
      const vPhotos: Record<string, string> = { ...(data.vehiclePhotos || {}) };
      for (let i = 0; i < vehiclePhotoFiles.length; i++) {
        const f = vehiclePhotoFiles[i];
        if (f) {
          this.validateImageFile(f);
          const detected = detectImageType(f.buffer)!;
          const ext = this.getExtension(detected);
          const filename = `vehicle_photo_${i}_${randomUUID()}${ext}`;
          const fullPath = path.join(dir, filename);
          await fs.writeFile(fullPath, f.buffer);
          vPhotos[`photo_${i}`] = `${app.id}/${filename}`;
        }
      }
      app.vehicle_photos = vPhotos;
    }

    await this.repo.save(app);
    return { id: app.id, status: app.status };
  }

  async list(params: {
    status?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: RegistrationApplication[];
    total: number;
  }> {
    const qb = this.repo.createQueryBuilder('r');
    if (params.status) {
      qb.andWhere('r.status = :status', { status: params.status });
    }
    if (params.role) {
      qb.andWhere('r.role = :role', { role: params.role });
    }
    const total = await qb.getCount();
    qb.orderBy('r.created_at', 'DESC');
    qb.take(params.limit ?? 50);
    qb.skip(params.offset ?? 0);
    const items = await qb.getMany();
    return { items, total };
  }

  async getById(id: string): Promise<RegistrationApplication> {
    const app = await this.repo.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException('Registration application not found');
    }
    return app;
  }

  /**
   * Get latest registration application status by phone (public, for driver app polling).
   * Tries raw input and local digits; DB stores phone_number (often local like 612345678).
   */
  async getStatusByPhone(phone: string): Promise<{
    id: string;
    status: string;
    rejection_reason: string | null;
  } | null> {
    const raw = String(phone || '').replace(/\s/g, '');
    if (!raw) return null;

    const digitsOnly = raw.replace(/\D/g, '');
    const local = digitsOnly.slice(-9);
    const normalized = tryNormalizePhoneNumber(raw);
    const candidates = [raw, digitsOnly, local, normalized].filter(Boolean) as string[];

    for (const p of [...new Set(candidates)]) {
      const [app] = await this.repo.find({
        where: { phone_number: p },
        order: { created_at: 'DESC' },
        take: 1,
        select: ['id', 'status', 'rejection_reason'],
      });
      if (app) {
        return {
          id: app.id,
          status: app.status,
          rejection_reason: app.rejection_reason,
        };
      }
    }
    return null;
  }

  async approve(id: string, reviewedBy: string): Promise<RegistrationApplication> {
    const app = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(RegistrationApplication)
        .createQueryBuilder('a')
        .where('a.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) throw new NotFoundException('Registration application not found');
      if (locked.status !== 'PENDING' && locked.status !== 'UNDER_REVIEW') {
        throw new BadRequestException(
          `Cannot approve application with status ${locked.status}`,
        );
      }
      locked.status = 'APPROVED';
      locked.reviewed_at = new Date();
      locked.reviewed_by = reviewedBy;
      locked.rejection_reason = null;
      await manager.save(RegistrationApplication, locked);
      return locked;
    });

    const rawPhone =
      (app.country_code || '') + String(app.phone_number || '').replace(/\s/g, '');
    const phone = normalizePhoneOrThrow(rawPhone);
    const accountType = app.role === 'driver' ? 'DRIVER' : 'COURIER';

    const identity = await this.unifiedIdentityService.findOrCreateByPhone(phone);
    const consumer = await this.usersService.findOrCreateForKyc(
      phone,
      app.full_name ?? undefined,
    );

    const roleUser = await this.usersService.ensureRoleAccount({
      phone_number: phone,
      account_type: accountType,
      unified_identity_id: identity.id,
      full_name: app.full_name ?? undefined,
    });

    if (accountType === 'DRIVER') {
      const existingProfile = await this.driversService.getDriverByUserId(roleUser.id);
      if (!existingProfile) {
        const vehicleType = this.mapVehicleCategory(app.vehicle_category);
        const vehiclePlate = app.license_plate || 'TBD';
        const driverProfile = await this.driversService.onboardDriver(
          roleUser.id,
          vehicleType,
          vehiclePlate,
        );
        await this.driversService.updateDriverStatus(driverProfile.id, DriverStatus.ACTIVE);
      }
    }

    return app;
  }

  private mapVehicleCategory(category: string | null): VehicleType {
    if (!category) return VehicleType.CAR;
    const c = String(category).toUpperCase();
    if (c === 'BIKE' || c === 'MOTORCYCLE') return VehicleType.BIKE;
    if (c === 'TAXI') return VehicleType.TAXI;
    return VehicleType.CAR;
  }

  async reject(
    id: string,
    reviewedBy: string,
    reason: string,
  ): Promise<RegistrationApplication> {
    const app = await this.getById(id);
    if (app.status !== 'PENDING' && app.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(
        `Cannot reject application with status ${app.status}`,
      );
    }
    app.status = 'REJECTED';
    app.reviewed_at = new Date();
    app.reviewed_by = reviewedBy;
    app.rejection_reason = reason || 'Rejected by admin';
    await this.repo.save(app);
    return app;
  }
}
