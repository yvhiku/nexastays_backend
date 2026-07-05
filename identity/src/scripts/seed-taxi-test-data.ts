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
const FATIMA_PHONE = '+212698765432';
const FATIMA_NAME = 'Fatima Alami';
const TEST_DRIVER_PHONE = '+212655555555';
const TEST_DRIVER_NAME = 'Test Driver';
const CONSUMER_LINKED_NAME = 'Taxi Test Consumer';
const TARGET_BALANCE_FATIMA = 500;

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

async function ensureDriver(
  phone: string,
  fullName: string,
  linkedUserId: string,
) {
  const userRepo = dataSource.getRepository(User);
  let user = await userRepo.findOne({
    where: { phone_number: phone, account_type: 'DRIVER' },
  });
  const pinHash = await bcrypt.hash(PIN, 10);
  if (!user) {
    user = await userRepo.save({
      phone_number: phone,
      full_name: fullName,
      account_type: 'DRIVER',
      linked_user_id: linkedUserId,
      kyc_status: 'PENDING',
      pin_hash: pinHash,
      status: 'ACTIVE',
      nationality: 'MA',
    });
  } else {
    user.full_name = fullName;
    user.linked_user_id = linkedUserId;
    user.pin_hash = pinHash;
    await userRepo.save(user);
  }
  return user;
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
  const ref = `SEED-TAXI-${accountId}-${Date.now()}`;
  const txn = await txnRepo.save({
    reference: ref,
    description: 'Taxi test seed balance',
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

  const fatima = await ensureConsumer(FATIMA_PHONE, FATIMA_NAME);
  await ensureKyc(fatima.id);
  const fatimaWallet = await ensureWallet(fatima.id);
  const fatimaAccount = await ensureLedgerAccount(fatimaWallet.id);
  await setBalance(fatimaAccount.id, TARGET_BALANCE_FATIMA);

  const linkedConsumer = await ensureConsumer(
    TEST_DRIVER_PHONE,
    CONSUMER_LINKED_NAME,
  );
  await ensureKyc(linkedConsumer.id);
  await ensureWallet(linkedConsumer.id);

  const driver = await ensureDriver(
    TEST_DRIVER_PHONE,
    TEST_DRIVER_NAME,
    linkedConsumer.id,
  );
  await ensureWallet(driver.id);

  await dataSource.destroy();
  console.log('Taxi test data seeded.');
  console.log(
    `  Fatima (CONSUMER): ${FATIMA_PHONE}, PIN ${PIN}, balance ${TARGET_BALANCE_FATIMA} MAD`,
  );
  console.log(`  Test Driver (DRIVER): ${TEST_DRIVER_PHONE}, PIN ${PIN}`);
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
