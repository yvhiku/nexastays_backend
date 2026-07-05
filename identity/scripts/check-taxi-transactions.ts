/**
 * Diagnostic script to check if AppTransaction records exist for completed taxi rides
 * Run with: npx ts-node -r tsconfig-paths/register scripts/check-taxi-transactions.ts
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

import { AppTransaction } from '../src/modules/transactions/entities/app-transaction.entity';
import { Ride } from '../src/modules/go-taxi/entities/ride.entity';
import { User } from '../src/modules/users/entities/user.entity';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'nexa123',
    database: process.env.DB_NAME || 'nexapay',
    entities: [AppTransaction, Ride, User],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Connected to database\n');

  // Get all completed rides
  const rides = await dataSource.getRepository(Ride).find({
    where: { status: 'COMPLETED' },
    relations: ['rider_user'],
    order: { completed_at: 'DESC' },
  });

  console.log(`Found ${rides.length} completed rides\n`);

  for (const ride of rides) {
    // Check if AppTransaction exists for this ride
    const appTx = await dataSource.getRepository(AppTransaction).findOne({
      where: {
        sender_user_id: ride.rider_user_id,
        type: 'TAXI_RIDE',
        reference: dataSource.getRepository(AppTransaction)
          .createQueryBuilder('t')
          .where("t.reference LIKE :pattern", { pattern: `%${ride.id}%` })
          .getQuery(),
      },
    });

    // Try to find by reference pattern
    const appTxs = await dataSource.getRepository(AppTransaction)
      .createQueryBuilder('t')
      .where("t.reference LIKE :pattern", { pattern: `%${ride.id}%` })
      .andWhere('t.type = :type', { type: 'TAXI_RIDE' })
      .getMany();

    const rider = ride.rider_user;
    console.log(`Ride ${ride.id}:`);
    console.log(`  Rider: ${rider?.full_name || rider?.phone_number || ride.rider_user_id}`);
    console.log(`  Fare: ${ride.fare_amount} MAD`);
    console.log(`  Completed: ${ride.completed_at}`);
    console.log(`  AppTransaction records: ${appTxs.length}`);
    if (appTxs.length > 0) {
      appTxs.forEach(tx => {
        console.log(`    - ${tx.id}: ${tx.amount} MAD, reference: ${tx.reference}`);
      });
    } else {
      console.log(`    ⚠️  NO AppTransaction found for this ride!`);
    }
    console.log('');
  }

  // Check for any TAXI_RIDE transactions
  const allTaxiTxs = await dataSource.getRepository(AppTransaction).find({
    where: { type: 'TAXI_RIDE' },
    order: { created_at: 'DESC' },
    take: 10,
  });

  console.log(`\nTotal TAXI_RIDE AppTransaction records: ${allTaxiTxs.length}`);
  if (allTaxiTxs.length > 0) {
    console.log('Recent TAXI_RIDE transactions:');
    allTaxiTxs.forEach(tx => {
      console.log(`  - ${tx.id}: ${tx.amount} MAD, sender: ${tx.sender_user_id}, reference: ${tx.reference}`);
    });
  }

  await dataSource.destroy();
}

main().catch(console.error);
