import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { RegistrationApplicationsService } from './registration-applications.service';
import { Public } from '../../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Go Registration')
@Controller('go/registration-applications')
export class RegistrationApplicationsController {
  constructor(
    private readonly registrationService: RegistrationApplicationsService,
  ) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Get application status by phone (for driver app polling)' })
  async getStatusByPhone(@Query('phone') phone: string) {
    const result = await this.registrationService.getStatusByPhone(phone || '');
    if (!result) return { status: null, id: null, rejection_reason: null };
    return result;
  }

  @Post()
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit driver/courier registration application' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['driver', 'courier'] },
        fullName: { type: 'string' },
        phoneNumber: { type: 'string' },
        countryCode: { type: 'string' },
        email: { type: 'string' },
        dateOfBirth: { type: 'string', format: 'date' },
        city: { type: 'string' },
        address: { type: 'string' },
        emergencyContact: { type: 'string' },
        identityDocumentType: { type: 'string' },
        vehicleMake: { type: 'string' },
        vehicleModel: { type: 'string' },
        vehicleYear: { type: 'number' },
        vehicleColor: { type: 'string' },
        licensePlate: { type: 'string' },
        vehicleCategory: { type: 'string' },
        driversLicenseExpiry: { type: 'string', format: 'date' },
        vehicleRegistrationExpiry: { type: 'string', format: 'date' },
        insuranceExpiry: { type: 'string', format: 'date' },
        vehiclePhotos: { type: 'string', description: 'JSON object of vehicle photo keys' },
        identity_front: { type: 'string', format: 'binary' },
        identity_back: { type: 'string', format: 'binary' },
        selfie: { type: 'string', format: 'binary' },
        drivers_license: { type: 'string', format: 'binary' },
        vehicle_registration: { type: 'string', format: 'binary' },
        insurance: { type: 'string', format: 'binary' },
        background_check: { type: 'string', format: 'binary' },
        vehicle_photos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'identity_front', maxCount: 1 },
        { name: 'identity_back', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
        { name: 'drivers_license', maxCount: 1 },
        { name: 'vehicle_registration', maxCount: 1 },
        { name: 'insurance', maxCount: 1 },
        { name: 'background_check', maxCount: 1 },
        { name: 'vehicle_photos', maxCount: 10 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  async submit(
    @Body()
    body: {
      role?: string;
      fullName?: string;
      phoneNumber?: string;
      countryCode?: string;
      email?: string;
      dateOfBirth?: string;
      city?: string;
      address?: string;
      emergencyContact?: string;
      identityDocumentType?: string;
      identity_reused?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleYear?: string;
      vehicleColor?: string;
      licensePlate?: string;
      vehicleCategory?: string;
      driversLicenseExpiry?: string;
      vehicleRegistrationExpiry?: string;
      insuranceExpiry?: string;
      vehiclePhotos?: string;
    },
    @UploadedFiles()
    files: {
      identity_front?: Express.Multer.File[];
      identity_back?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
      drivers_license?: Express.Multer.File[];
      vehicle_registration?: Express.Multer.File[];
      insurance?: Express.Multer.File[];
      background_check?: Express.Multer.File[];
      vehicle_photos?: Express.Multer.File[];
    },
  ) {
    let vehiclePhotos: Record<string, string> = {};
    if (body.vehiclePhotos && typeof body.vehiclePhotos === 'string') {
      try {
        vehiclePhotos = JSON.parse(body.vehiclePhotos) as Record<string, string>;
      } catch {
        // ignore
      }
    }
    const vehicleYear =
      body.vehicleYear != null ? parseInt(String(body.vehicleYear), 10) : undefined;
    return this.registrationService.submit(
      {
        role: body.role || 'driver',
        fullName: body.fullName,
        phoneNumber: body.phoneNumber || '',
        countryCode: body.countryCode,
        email: body.email,
        dateOfBirth: body.dateOfBirth,
        city: body.city,
        address: body.address,
        emergencyContact: body.emergencyContact,
        identityDocumentType: body.identityDocumentType,
        identityReused: body.identity_reused === 'true',
        vehicleMake: body.vehicleMake,
        vehicleModel: body.vehicleModel,
        vehicleYear: Number.isFinite(vehicleYear) ? vehicleYear : undefined,
        vehicleColor: body.vehicleColor,
        licensePlate: body.licensePlate,
        vehicleCategory: body.vehicleCategory,
        driversLicenseExpiry: body.driversLicenseExpiry,
        vehicleRegistrationExpiry: body.vehicleRegistrationExpiry,
        insuranceExpiry: body.insuranceExpiry,
        vehiclePhotos: Object.keys(vehiclePhotos).length ? vehiclePhotos : undefined,
      },
      files || {},
    );
  }
}
