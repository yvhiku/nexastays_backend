/**
 * Backfill AppTransaction records for completed taxi rides that don't have them
 * Run with: npx ts-node -r tsconfig-paths/register scripts/backfill-taxi-transactions.ts
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

import { AppTransaction } from '../src/modules/transactions/entities/app-transaction.entity';
import { TransactionFee } from '../src/modules/transactions/entities/transaction-fee.entity';
import { Ride } from '../src/modules/go-taxi/entities/ride.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { IdempotencyKey } from '../src/modules/users/entities/idempotency-key.entity';
import { Wallet } from '../src/modules/wallets/entities/wallet.entity';
import { LedgerAccount } from '../src/modules/ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../src/modules/ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../src/modules/ledger/entities/ledger-transaction.entity';
import { KycProfile } from '../src/modules/compliance/entities/kyc-profile.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'nexa123',
    database: process.env.DB_NAME || 'nexapay',
    entities: [
      AppTransaction,
      TransactionFee,
      Ride,
      User,
      IdempotencyKey,
      Wallet,
      LedgerAccount,
      LedgerEntry,
      LedgerTransaction,
      KycProfile,
      AuditLog,
    ],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Connected to database\n');

  const rideRepo = dataSource.getRepository(Ride);
  const appTxRepo = dataSource.getRepository(AppTransaction);

  // Get all completed rides
  const rides = await rideRepo.find({
    where: { status: 'COMPLETED' },
    order: { completed_at: 'DESC' },
  });

  console.log(`Found ${rides.length} completed rides\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const ride of rides) {
    // Check if AppTransaction already exists for this ride by reference pattern
    const existingTxs = await appTxRepo
      .createQueryBuilder('t')
      .where("t.reference LIKE :pattern", { pattern: `%${ride.id}%` })
      .andWhere('t.type = :type', { type: 'TAXI_RIDE' })
      .andWhere('t.sender_user_id = :userId', { userId: ride.rider_user_id })
      .getMany();

    if (existingTxs.length > 0) {
      console.log(`Ride ${ride.id}: Already has AppTransaction, skipping`);
      skipped++;
      continue;
    }

    // Create AppTransaction for this ride
    const fare = Number(ride.fare_amount);
    const appTxReference = `TAXI-${ride.id}-${ride.completed_at?.getTime() || Date.now()}`;
    
    try {
      const appTx = await appTxRepo.save({
        sender_user_id: ride.rider_user_id,
        receiver_user_id: ride.driver_user_id,
        amount: fare,
        type: 'TAXI_RIDE',
        status: 'COMPLETED',
        reference: appTxReference,
        created_at: ride.completed_at || ride.updated_at || new Date(),
      });
      console.log(`✓ Created AppTransaction ${appTx.id} for ride ${ride.id}: ${fare} MAD`);
      created++;
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation - already exists
        console.log(`Ride ${ride.id}: AppTransaction already exists (unique constraint)`);
        skipped++;
      } else {
        console.error(`✗ Failed to create AppTransaction for ride ${ride.id}:`, error.message);
        errors++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  await dataSource.destroy();
}

main().catch(console.error);
