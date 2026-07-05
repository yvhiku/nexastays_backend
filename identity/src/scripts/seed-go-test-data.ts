import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../common/config/database.config';
import { User } from '../modules/users/entities/user.entity';
import { Wallet } from '../modules/wallets/entities/wallet.entity';
import { DriverProfile } from '../modules/go-taxi/drivers/entities/driver-profile.entity';
import { DriverAvailability } from '../modules/go-taxi/drivers/entities/driver-availability.entity';
import { VehicleType } from '../modules/go-taxi/enums/vehicle-type.enum';
import { DriverStatus } from '../modules/go-taxi/enums/driver-status.enum';
import * as bcrypt from 'bcrypt';

const dataSource = new DataSource({
  ...databaseConfig,
  entities: [User, Wallet, DriverProfile, DriverAvailability],
  synchronize: false,
  logging: true,
});

async function ensureDriverUser() {
  const userRepo = dataSource.getRepository(User);
  const walletRepo = dataSource.getRepository(Wallet);
  const driverRepo = dataSource.getRepository(DriverProfile);
  const availabilityRepo = dataSource.getRepository(DriverAvailability);

  // Test driver phone number (using merchant test account)
  const driverPhone = '+212611111111';
  const pinHash = await bcrypt.hash('123456', 10);

  // Get or create user
  let user = await userRepo.findOne({
    where: { phone_number: driverPhone },
  });

  if (!user) {
    user = userRepo.create({
      phone_number: driverPhone,
      full_name: 'Test Driver',
      pin_hash: pinHash,
      status: 'ACTIVE',
      kyc_status: 'APPROVED',
      risk_score: 0,
    });
    user = await userRepo.save(user);

    // Create wallet
    const wallet = walletRepo.create({
      user_id: user.id,
      currency: 'MAD',
      status: 'ACTIVE',
    });
    await walletRepo.save(wallet);
    console.log(`✅ Created user and wallet for driver: ${driverPhone}`);
  } else {
    console.log(`ℹ️  User already exists: ${driverPhone}`);
  }

  // Create driver profile
  let driver = await driverRepo.findOne({
    where: { user_id: user.id },
  });

  if (!driver) {
    driver = driverRepo.create({
      user_id: user.id,
      vehicle_type: VehicleType.CAR,
      vehicle_plate: 'ABC-1234',
      status: DriverStatus.ACTIVE,
    });
    driver = await driverRepo.save(driver);
    console.log(`✅ Created driver profile: ${driver.id}`);

    // Create availability record
    const availability = availabilityRepo.create({
      driver_id: driver.id,
      is_online: false,
      latitude: 33.5731, // Casablanca
      longitude: -7.5898,
    });
    await availabilityRepo.save(availability);
    console.log(`✅ Created driver availability record`);
  } else {
    console.log(`ℹ️  Driver profile already exists for user: ${user.id}`);
  }

  return { user, driver };
}

async function seed() {
  try {
    await dataSource.initialize();
    console.log('📦 Seeding Nexa Go test data...\n');

    const { user, driver } = await ensureDriverUser();

    console.log('\n✅ Nexa Go seed completed successfully!');
    console.log(`\nTest Driver Account:`);
    console.log(`  Phone: ${user.phone_number}`);
    console.log(`  PIN: 123456`);
    console.log(`  Driver ID: ${driver.id}`);
    console.log(`  Vehicle: ${driver.vehicle_type} - ${driver.vehicle_plate}`);
    console.log(`  Status: ${driver.status}`);
    console.log(`\n💡 Use this account to test driver endpoints.`);
    console.log(
      `💡 Use existing test accounts (+212612345678, +212698765432) as riders.`,
    );

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
