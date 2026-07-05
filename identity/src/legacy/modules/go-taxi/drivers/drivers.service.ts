import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { safeLogger } from '../../../common/logging/safe-logger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DriverProfile } from './entities/driver-profile.entity';
import { DriverAvailability } from './entities/driver-availability.entity';
import { RegistrationApplication } from '../entities/registration-application.entity';
import { User } from '../../users/entities/user.entity';
import { VehicleType } from '../enums/vehicle-type.enum';
import { DriverStatus } from '../enums/driver-status.enum';
import { UsersService } from '../../users/users.service';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(DriverProfile)
    private readonly driverProfileRepository: Repository<DriverProfile>,
    @InjectRepository(DriverAvailability)
    private readonly driverAvailabilityRepository: Repository<DriverAvailability>,
    @InjectRepository(RegistrationApplication)
    private readonly registrationRepo: Repository<RegistrationApplication>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Onboard a user as a driver
   * @param userId User ID from core.users
   * @param vehicleType Type of vehicle
   * @param vehiclePlate Vehicle plate number
   * @returns Created driver profile
   */
  async onboardDriver(
    userId: string,
    vehicleType: VehicleType,
    vehiclePlate: string,
  ): Promise<DriverProfile> {
    // Verify user exists
    try {
      await this.usersService.getMe(userId);
    } catch (error) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already a driver
    const existing = await this.driverProfileRepository.findOne({
      where: { user_id: userId },
    });
    if (existing) {
      throw new ConflictException('User is already a driver');
    }

    // Create driver profile
    const driverProfile = this.driverProfileRepository.create({
      user_id: userId,
      vehicle_type: vehicleType,
      vehicle_plate: vehiclePlate,
      status: DriverStatus.PENDING,
    });

    const saved = await this.driverProfileRepository.save(driverProfile);

    // Create availability record
    await this.driverAvailabilityRepository.save({
      driver_id: saved.id,
      is_online: false,
    });

    return saved;
  }

  /**
   * Get driver profile by user ID
   */
  async getDriverByUserId(userId: string): Promise<DriverProfile | null> {
    return this.driverProfileRepository.findOne({
      where: { user_id: userId },
      relations: ['user', 'availability'],
    });
  }

  /**
   * Get driver profile by driver ID
   */
  async getDriverById(driverId: string): Promise<DriverProfile> {
    const driver = await this.driverProfileRepository.findOne({
      where: { id: driverId },
      relations: ['user', 'availability'],
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  /**
   * Update driver availability (online/offline and location)
   */
  async setAvailability(
    driverId: string,
    isOnline: boolean,
    latitude?: number,
    longitude?: number,
  ): Promise<DriverAvailability> {
    const driver = await this.getDriverById(driverId);

    let availability = await this.driverAvailabilityRepository.findOne({
      where: { driver_id: driverId },
    });

    if (!availability) {
      availability = this.driverAvailabilityRepository.create({
        driver_id: driverId,
        is_online: isOnline,
        latitude,
        longitude,
      });
    } else {
      availability.is_online = isOnline;
      if (latitude !== undefined) {
        availability.latitude = latitude;
      }
      if (longitude !== undefined) {
        availability.longitude = longitude;
      }
      availability.updated_at = new Date();
    }

    return this.driverAvailabilityRepository.save(availability);
  }

  /**
   * Get all available drivers (online and within optional radius)
   * MVP: Simple distance-based filtering
   */
  async getAvailableDrivers(
    latitude?: number,
    longitude?: number,
    radiusKm?: number,
  ): Promise<DriverProfile[]> {
    const query = this.driverProfileRepository
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.availability', 'availability')
      .leftJoinAndSelect('driver.user', 'user')
      .where('availability.is_online = :isOnline', { isOnline: true })
      .andWhere('driver.status = :status', { status: DriverStatus.ACTIVE });

    // If location provided, filter by distance (simple MVP - can be optimized later)
    if (latitude && longitude && radiusKm) {
      // This is a simplified distance filter
      // In production, use PostGIS or a more sophisticated geospatial query
      query.andWhere('availability.latitude IS NOT NULL');
      query.andWhere('availability.longitude IS NOT NULL');
    }

    return query.getMany();
  }

  /**
   * Get fully hydrated driver profile for app Profile screen.
   * Merges: users, driver_profiles, approved registration_application.
   * Resolves both: userId of DRIVER account, or linked CONSUMER (driver app may use either).
   */
  async getDriverProfileForUser(userId: string): Promise<{
    id: string;
    driver_id: string;
    full_name: string | null;
    phone_number: string | null;
    email: string | null;
    city: string | null;
    profile_photo_url: string | null;
    verified_driver: boolean;
    driver_status: string;
    vehicle_summary: string | null;
    vehicle: {
      make_model: string;
      year: number | null;
      color: string | null;
      plate: string | null;
      category: string | null;
    } | null;
    documents: {
      license: { status: string; expiry?: string };
      registration: { status: string; expiry?: string };
      insurance: { status: string; expiry?: string };
      background_check: { status: string };
    };
    application_status: string;
  } | null> {
    const authUserId = userId;
    console.log('[DriversService] getDriverProfileForUser called, authUserId=', authUserId);

    // 1. Resolve driver (userId may be DRIVER or CONSUMER with same identity)
    // Primary: unified_identity_id. Legacy fallback: linked_user_id (CONSUMER→DRIVER) when identity missing.
    let driver = await this.getDriverByUserId(userId);
    let driverUserId = userId;
    if (!driver) {
      const currentUser = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'unified_identity_id'],
      });
      if (currentUser?.unified_identity_id) {
        const driverUser = await this.usersService.findByUnifiedIdentityIdAndAccountType(
          currentUser.unified_identity_id,
          'DRIVER',
        );
        if (driverUser) {
          driverUserId = driverUser.id;
          driver = await this.getDriverByUserId(driverUser.id);
        }
      }
      if (!driver) {
        const legacyDriver = await this.userRepository.findOne({
          where: { linked_user_id: userId, account_type: 'DRIVER' as any },
          select: ['id'],
        });
        if (legacyDriver) {
          driverUserId = legacyDriver.id;
          driver = await this.getDriverByUserId(legacyDriver.id);
        }
      }
    } else {
      driverUserId = userId;
    }
    if (!driver) {
      console.log('[DriversService] No driver found, returning null');
      return null;
    }
    console.log('[DriversService] resolved driverUserId=', driverUserId, 'driverId=', driver.id);

    // 2. Load approved registration application (source of truth for onboarding data)
    const driverPhone = String((driver as any).user?.phone_number || '')
      .replace(/\s/g, '');
    const currentUser = await this.usersService.getMe(userId);
    const fallbackPhone = (currentUser as any).phone_number;
    const phone = String(driverPhone || fallbackPhone || '').replace(/\s/g, '');
    const digitsOnly = phone.replace(/\D/g, '');
    const local = digitsOnly.length >= 9 ? digitsOnly.slice(-9) : digitsOnly;
    const candidates = [
      ...new Set([
        phone,
        digitsOnly,
        local,
        digitsOnly.startsWith('212') ? digitsOnly : `212${local}`,
        local ? `0${local}` : '',
        local ? `+212${local}` : '',
        local ? `+212 ${local}` : '',
      ]),
    ].filter(Boolean);

    let reg: RegistrationApplication | null = null;
    console.log('[DriversService] querying registration, candidatesCount=', candidates.length, 'local=', local || '(empty)');

    if (candidates.length > 0) {
      reg =
        (await this.registrationRepo.find({
          where: { phone_number: In(candidates), status: 'APPROVED', role: 'driver' },
          order: { created_at: 'DESC' },
          take: 1,
        }))[0] ?? null;
    }
    if (!reg && local) {
      reg = await this.registrationRepo
        .createQueryBuilder('r')
        .where("r.status = 'APPROVED'")
        .andWhere("r.role = 'driver'")
        .andWhere(
          "RIGHT(REGEXP_REPLACE(r.phone_number, '\\D', '', 'g'), 9) = :local",
          { local },
        )
        .orderBy('r.created_at', 'DESC')
        .limit(1)
        .getOne();
    }
    if (!reg) {
      const driverName = String((driver as any).user?.full_name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (driverName.length >= 2) {
        const recent = await this.registrationRepo.find({
          where: { status: 'APPROVED', role: 'driver' },
          order: { created_at: 'DESC' },
          take: 50,
        });
        reg =
          recent.find((a) => {
            const rn = String(a.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
            return rn && (rn === driverName || rn.includes(driverName) || driverName.includes(rn));
          }) ?? null;
      }
    }
    if (!reg && driver.vehicle_plate && driver.vehicle_plate !== 'TBD') {
      reg = await this.registrationRepo.findOne({
        where: { license_plate: driver.vehicle_plate, status: 'APPROVED', role: 'driver' },
        order: { created_at: 'DESC' },
      });
    }
    // Fallback 4: in-memory match by full normalized phone (country_code + digits)
    if (!reg) {
      const recent = await this.registrationRepo.find({
        where: { status: 'APPROVED', role: 'driver' },
        order: { created_at: 'DESC' },
        take: 100,
      });
      const targetNorm = digitsOnly.replace(/\D/g, '').slice(-9);
      reg =
        recent.find((a) => {
          const cc = String(a.country_code || '').replace(/\D/g, '');
          const pn = String(a.phone_number || '').replace(/\D/g, '').slice(-9);
          const combined = (cc + pn).replace(/\D/g, '').slice(-9);
          return combined === targetNorm || pn === targetNorm;
        }) ?? null;
    }

    if (!reg) {
      const allApproved = await this.registrationRepo.find({
        where: { status: 'APPROVED', role: 'driver' },
        order: { created_at: 'DESC' },
        take: 10,
        select: ['id', 'phone_number', 'full_name', 'license_plate'],
      });
      console.log('[DriversService] REG NOT FOUND. Sample approved regs:', allApproved.map((r) => ({
        id: r.id,
        phone: r.phone_number,
        name: r.full_name,
        plate: r.license_plate,
      })));
      console.log('[DriversService] Our candidates=', candidates, 'driverName=', (driver as any).user?.full_name, 'driverPlate=', driver.vehicle_plate);
    }
    console.log('[DriversService] approvedRegId=', reg?.id ?? 'null', 'hasReg=', !!reg);
    safeLogger.info('GET /go/drivers/me resolved', {
      authUserId,
      driverUserId,
      driverId: driver.id,
      approvedRegId: reg?.id ?? null,
      hasReg: !!reg,
    });

    const toDocStatus = (
      expiry: Date | null,
      hasPath?: boolean,
    ): { status: string; expiry?: string } => {
      const approved = reg?.status === 'APPROVED';
      const verified = approved && (hasPath || !!expiry);
      if (expiry) {
        const exp = expiry instanceof Date ? expiry : new Date(expiry);
        const expStr = exp.toISOString().slice(0, 10);
        if (exp < new Date()) return { status: 'EXPIRED', expiry: expStr };
        return { status: verified ? 'VERIFIED' : 'PENDING', expiry: expStr };
      }
      if (verified && hasPath) return { status: 'VERIFIED' };
      return { status: 'PENDING' };
    };

    const vehicleParts: string[] = [];
    if (reg) {
      if (reg.vehicle_make || reg.vehicle_model) {
        vehicleParts.push([reg.vehicle_make, reg.vehicle_model].filter(Boolean).join(' '));
      }
      if (reg.vehicle_year) vehicleParts.push(String(reg.vehicle_year));
      if (reg.vehicle_color) vehicleParts.push(reg.vehicle_color);
      if (reg.license_plate) vehicleParts.push(reg.license_plate);
      if (reg.vehicle_category) vehicleParts.push(reg.vehicle_category);
    }
    if (vehicleParts.length === 0) {
      vehicleParts.push(driver.vehicle_type || '');
      vehicleParts.push(driver.vehicle_plate || '');
    }
    const vehicle_summary = vehicleParts.filter(Boolean).join(' · ') || null;

    const makeModel = reg
      ? [reg.vehicle_make, reg.vehicle_model].filter(Boolean).join(' ').trim() || ''
      : '';
    const vehicle =
      reg || driver.vehicle_plate
        ? {
            make_model: reg
              ? makeModel || 'Vehicle'
              : String(driver.vehicle_type || '') + (driver.vehicle_plate ? ` ${driver.vehicle_plate}` : ''),
            year: reg?.vehicle_year ?? null,
            color: reg?.vehicle_color ?? null,
            plate: reg?.license_plate ?? driver.vehicle_plate ?? null,
            category: reg?.vehicle_category ?? null,
          }
        : null;

    const licenseDoc = toDocStatus(
      reg?.drivers_license_expiry ?? null,
      !!reg?.drivers_license_path,
    );
    const registrationDoc = toDocStatus(
      reg?.vehicle_registration_expiry ?? null,
      !!reg?.vehicle_registration_path,
    );
    const insuranceDoc = toDocStatus(reg?.insurance_expiry ?? null, !!reg?.insurance_path);
    const backgroundCheckDoc = reg?.background_check_path
      ? { status: 'VERIFIED' as const }
      : { status: 'PENDING' as const };

    const user = (currentUser as any) || {};
    const driverUser = (driver as any).user || {};

    console.log('[DriversService] final vehicle_summary=', vehicle_summary, 'licenseStatus=', licenseDoc.status, 'regStatus=', registrationDoc.status);
    safeLogger.info('GET /go/drivers/me merged payload', {
      vehicle_summary: vehicle_summary ?? '(null)',
      vehicle_plate: vehicle?.plate ?? '(null)',
      licenseStatus: licenseDoc.status,
      regStatus: registrationDoc.status,
      insStatus: insuranceDoc.status,
    });

    return {
      id: driverUserId,
      driver_id: driver.id,
      full_name: reg?.full_name ?? driverUser.full_name ?? user.full_name ?? null,
      phone_number: driverUser.phone_number ?? user.phone_number ?? reg?.phone_number ?? null,
      email: reg?.email ?? driverUser.email ?? user.email ?? null,
      city: reg?.city ?? driverUser.city ?? user.city ?? null,
      profile_photo_url: driverUser.profile_photo_url ?? user.profile_photo_url ?? null,
      verified_driver: !!reg && reg.status === 'APPROVED',
      driver_status: reg?.status ?? driver.status,
      vehicle_summary,
      vehicle,
      documents: {
        license: licenseDoc,
        registration: registrationDoc,
        insurance: insuranceDoc,
        background_check: backgroundCheckDoc,
      },
      application_status: reg?.status ?? 'PENDING',
    };
  }

  /**
   * List drivers for admin with optional status filter and pagination.
   */
  async listForAdmin(params: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const qb = this.driverProfileRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'user')
      .leftJoinAndSelect('d.availability', 'availability')
      .orderBy('d.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (params.status && params.status !== 'all') {
      qb.andWhere('d.status = :status', { status: params.status });
    }

    const [drivers, total] = await qb.getManyAndCount();

    const data = drivers.map((d) => {
      const u = (d as any).user;
      const av = (d as any).availability;
      return {
        id: d.id,
        user_id: d.user_id,
        full_name: u?.full_name ?? null,
        phone_number: u?.phone_number ?? null,
        email: u?.email ?? null,
        vehicle_type: d.vehicle_type,
        vehicle_plate: d.vehicle_plate,
        status: d.status,
        is_online: av?.is_online ?? false,
        created_at: d.created_at,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Update driver status (e.g., activate, suspend)
   */
  async updateDriverStatus(
    driverId: string,
    status: DriverStatus,
  ): Promise<DriverProfile> {
    const driver = await this.getDriverById(driverId);
    driver.status = status;
    return this.driverProfileRepository.save(driver);
  }
}
