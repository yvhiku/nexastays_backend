/**
 * DEV-ONLY bootstrap: may insert ledger rows directly (not via LedgerPostingService).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { databaseConfig } from '../common/config/database.config';
import { User } from '../modules/users/entities/user.entity';
import { IdempotencyKey } from '../modules/users/entities/idempotency-key.entity';
import { Wallet } from '../modules/wallets/entities/wallet.entity';
import { LedgerAccount } from '../modules/ledger/entities/ledger-account.entity';
import {
  LedgerEntry,
  EntryType,
} from '../modules/ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../modules/ledger/entities/ledger-transaction.entity';
import { AppTransaction } from '../modules/transactions/entities/app-transaction.entity';
import { TransactionFee } from '../modules/transactions/entities/transaction-fee.entity';
import { KycProfile } from '../modules/compliance/entities/kyc-profile.entity';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';

const PIN = '1234';
const AHMED_PHONE = '+212612345678';
const AHMED_NAME = 'Ahmed Benali';
const RESTAURANT_PHONE = '+212666666666';
const RESTAURANT_NAME = 'Test Restaurant';
const COURIER_PHONE = '+212777777777';
const COURIER_NAME = 'Test Courier';
const TARGET_BALANCE_AHMED = 500;

const dataSource = new DataSource({
  ...databaseConfig,
  entities: [
    User,
    IdempotencyKey,
    Wallet,
    LedgerAccount,
    LedgerEntry,
    LedgerTransaction,
    AppTransaction,
    TransactionFee,
    KycProfile,
    AuditLog,
  ],
  synchronize: false,
  logging: false,
});

async function ensureConsumer(phone: string, fullName: string) {
  const userRepo = dataSource.getRepository(User);
  let user = await userRepo.findOne({
    where: { phone_number: phone, account_type: 'CONSUMER' },
  });
  const pinHash = await bcrypt.hash(PIN, 10);
  if (!user) {
    user = await userRepo.save({
      phone_number: phone,
      full_name: fullName,
      account_type: 'CONSUMER',
      kyc_status: 'APPROVED',
      pin_hash: pinHash,
      status: 'ACTIVE',
      nationality: 'MA',
    });
  } else {
    user.full_name = fullName;
    user.kyc_status = 'APPROVED';
    user.pin_hash = pinHash;
    await userRepo.save(user);
  }
  return user;
}

async function ensureMerchant(phone: string, fullName: string) {
  const userRepo = dataSource.getRepository(User);
  // First, ensure CONSUMER account exists with correct PIN (verifyPin checks CONSUMER PIN)
  const consumer = await userRepo.findOne({
    where: { phone_number: phone, account_type: 'CONSUMER' },
  });
  const pinHash = await bcrypt.hash(PIN, 10);

  if (consumer) {
    consumer.pin_hash = pinHash;
    await userRepo.save(consumer);
  } else {
    await userRepo.save({
      phone_number: phone,
      full_name: fullName,
      account_type: 'CONSUMER',
      kyc_status: 'APPROVED',
      pin_hash: pinHash,
      status: 'ACTIVE',
      nationality: 'MA',
    });
  }

  // Now ensure MERCHANT account exists
  let merchant = await userRepo.findOne({
    where: { phone_number: phone, account_type: 'MERCHANT' },
  });
  if (!merchant) {
    merchant = await userRepo.save({
      phone_number: phone,
      full_name: fullName,
      account_type: 'MERCHANT',
      kyc_status: 'APPROVED',
      pin_hash: pinHash,
      status: 'ACTIVE',
      nationality: 'MA',
    });
  } else {
    merchant.full_name = fullName;
    merchant.kyc_status = 'APPROVED';
    merchant.pin_hash = pinHash;
    await userRepo.save(merchant);
  }
  return merchant;
}

async function ensureWallet(userId: string): Promise<Wallet> {
  const walletRepo = dataSource.getRepository(Wallet);
  let wallet = await walletRepo.findOne({ where: { user_id: userId } });
  if (!wallet) {
    wallet = await walletRepo.save({
      user_id: userId,
      currency: 'MAD',
      status: 'ACTIVE',
    });
  }
  return wallet;
}

async function ensureLedgerAccount(walletId: string): Promise<LedgerAccount> {
  const accountRepo = dataSource.getRepository(LedgerAccount);
  let account = await accountRepo.findOne({
    where: { wallet_id: walletId, account_type: 'WALLET' },
  });
  if (!account) {
    account = await accountRepo.save({
      wallet_id: walletId,
      system_account: false,
      account_type: 'WALLET',
    });
  }
  return account;
}

async function setBalance(accountId: string, targetBalance: number) {
  const entryRepo = dataSource.getRepository(LedgerEntry);
  const txnRepo = dataSource.getRepository(LedgerTransaction);
  const row = await entryRepo
    .createQueryBuilder('e')
    .select(
      "COALESCE(SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)",
      'balance',
    )
    .where('e.account_id = :accountId', { accountId })
    .getRawOne();
  const current = Number(row?.balance ?? 0);
  const delta = Math.round((targetBalance - current) * 100) / 100;
  if (delta === 0) return;
  const ref = `SEED-FOOD-${accountId}-${Date.now()}`;
  const txn = await txnRepo.save({
    reference: ref,
    description: 'Food test seed balance',
  });
  await entryRepo.save({
    transaction_id: txn.id,
    account_id: accountId,
    amount: Math.abs(delta),
    entry_type: delta > 0 ? EntryType.CREDIT : EntryType.DEBIT,
  });
}

async function ensureKyc(userId: string) {
  const kycRepo = dataSource.getRepository(KycProfile);
  let kyc = await kycRepo.findOne({ where: { user_id: userId } });
  if (!kyc) {
    kyc = kycRepo.create({
      user_id: userId,
      level: 'TIER_2',
      status: 'VERIFIED',
      provider: 'seed',
      documents: { id_document: true, selfie: true, liveness: true },
      aml_screening: { status: 'CLEAR', score: 0 },
      reviewed_by: 'seed',
      reviewed_at: new Date(),
    });
    await kycRepo.save(kyc);
  } else {
    kyc.status = 'VERIFIED';
    kyc.reviewed_by = 'seed';
    kyc.reviewed_at = new Date();
    await kycRepo.save(kyc);
  }
}

async function seed() {
  await dataSource.initialize();

  const ahmed = await ensureConsumer(AHMED_PHONE, AHMED_NAME);
  await ensureKyc(ahmed.id);
  const ahmedWallet = await ensureWallet(ahmed.id);
  const ahmedAccount = await ensureLedgerAccount(ahmedWallet.id);
  await setBalance(ahmedAccount.id, TARGET_BALANCE_AHMED);

  const restaurant = await ensureMerchant(RESTAURANT_PHONE, RESTAURANT_NAME);
  await ensureKyc(restaurant.id);
  const restaurantWallet = await ensureWallet(restaurant.id);
  await ensureLedgerAccount(restaurantWallet.id);

  const courier = await ensureConsumer(COURIER_PHONE, COURIER_NAME);
  await ensureKyc(courier.id);
  const courierWallet = await ensureWallet(courier.id);
  await ensureLedgerAccount(courierWallet.id);

  await dataSource.destroy();
  console.log('Food order test data seeded.');
  console.log(
    `  Ahmed (CONSUMER): ${AHMED_PHONE}, PIN ${PIN}, balance ${TARGET_BALANCE_AHMED} MAD`,
  );
  console.log(`  Test Restaurant (MERCHANT): ${RESTAURANT_PHONE}, PIN ${PIN}`);
  console.log(`  Test Courier (CONSUMER): ${COURIER_PHONE}, PIN ${PIN}`);
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
