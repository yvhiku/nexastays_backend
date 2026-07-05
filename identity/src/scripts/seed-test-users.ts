/**
 * DEV-ONLY bootstrap: may insert ledger rows directly (not via LedgerPostingService).
 * Do not copy this pattern into production money paths.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../common/config/database.config';
import { User } from '../modules/users/entities/user.entity';
import { Wallet } from '../modules/wallets/entities/wallet.entity';
import { LedgerAccount } from '../modules/ledger/entities/ledger-account.entity';
import {
  LedgerEntry,
  EntryType,
} from '../modules/ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../modules/ledger/entities/ledger-transaction.entity';
import { AppTransaction } from '../modules/transactions/entities/app-transaction.entity';
import { KycProfile } from '../modules/compliance/entities/kyc-profile.entity';

const dataSource = new DataSource({
  ...databaseConfig,
  entities: [
    User,
    Wallet,
    LedgerAccount,
    LedgerEntry,
    LedgerTransaction,
    AppTransaction,
    KycProfile,
  ],
  synchronize: false,
  logging: false,
});

async function ensureUser(userData: {
  phone_number: string;
  full_name: string;
  email: string;
  risk_score: number;
}) {
  const userRepo = dataSource.getRepository(User);
  let user = await userRepo.findOne({
    where: { phone_number: userData.phone_number },
  });
  if (!user) {
    user = userRepo.create({
      phone_number: userData.phone_number,
      full_name: userData.full_name,
      email: userData.email,
      pin_hash: 'seeded-pin-hash',
      status: 'ACTIVE',
      risk_score: userData.risk_score,
      last_login_at: new Date(),
    });
  } else {
    user.full_name = userData.full_name;
    user.email = userData.email;
    user.risk_score = userData.risk_score;
  }
  return userRepo.save(user);
}

async function ensureWallet(userId: string) {
  const walletRepo = dataSource.getRepository(Wallet);
  let wallet = await walletRepo.findOne({ where: { user_id: userId } });
  if (!wallet) {
    wallet = walletRepo.create({
      user_id: userId,
      currency: 'MAD',
      status: 'ACTIVE',
    });
  }
  return walletRepo.save(wallet);
}

async function ensureLedgerBalance(walletId: string, targetBalance: number) {
  const accountRepo = dataSource.getRepository(LedgerAccount);
  const entryRepo = dataSource.getRepository(LedgerEntry);
  const transactionRepo = dataSource.getRepository(LedgerTransaction);

  let account = await accountRepo.findOne({
    where: { wallet_id: walletId, account_type: 'USER_MAIN' },
  });
  if (!account) {
    account = accountRepo.create({
      wallet_id: walletId,
      system_account: false,
      account_type: 'USER_MAIN',
    });
    account = await accountRepo.save(account);
  }

  const currentRow = await entryRepo
    .createQueryBuilder('e')
    .select(
      "COALESCE(SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)",
      'balance',
    )
    .where('e.account_id = :accountId', { accountId: account.id })
    .getRawOne();

  const currentBalance = Number(currentRow?.balance || 0);
  const delta = Number((targetBalance - currentBalance).toFixed(2));
  if (delta === 0) {
    return;
  }

  const ledgerTx = await transactionRepo.save(
    transactionRepo.create({
      reference: `SEED-LEDGER-${walletId}-${Date.now()}`,
      description: 'Seeded wallet balance',
    }),
  );

  await entryRepo.save(
    entryRepo.create({
      transaction_id: ledgerTx.id,
      account_id: account.id,
      amount: Math.abs(delta),
      entry_type: delta >= 0 ? EntryType.CREDIT : EntryType.DEBIT,
    }),
  );
}

async function ensureKycProfile(
  userId: string,
  data: {
    status: string;
    level: string;
    provider: string;
    reviewedBy?: string;
    documents: { id_document?: boolean; selfie?: boolean; liveness?: boolean };
    aml_screening: { status?: string; score?: number };
  },
) {
  const kycRepo = dataSource.getRepository(KycProfile);
  let kyc = await kycRepo.findOne({ where: { user_id: userId } });
  if (!kyc) {
    kyc = kycRepo.create({ user_id: userId });
  }

  kyc.status = data.status;
  kyc.level = data.level;
  kyc.provider = data.provider;
  kyc.documents = data.documents;
  kyc.aml_screening = data.aml_screening;
  kyc.reviewed_by = data.reviewedBy || null;
  kyc.reviewed_at = data.reviewedBy ? new Date() : null;
  kyc.rejection_reason = data.status === 'REJECTED' ? 'Seeded rejection' : null;

  return kycRepo.save(kyc);
}

async function ensureTransactions(userId: string, otherUserId: string) {
  const txRepo = dataSource.getRepository(AppTransaction);
  const existing = await txRepo.count({ where: { sender_user_id: userId } });
  if (existing >= 3) {
    return;
  }

  const seedPrefix = `SEED-${userId}`;
  const now = new Date();

  const transactions = [
    txRepo.create({
      reference: `${seedPrefix}-DEP-${Date.now()}`,
      type: 'DEPOSIT',
      amount: 200,
      status: 'COMPLETED',
      sender_user_id: null,
      receiver_user_id: userId,
      idempotency_key: `${seedPrefix}-DEP`,
      created_at: now,
    }),
    txRepo.create({
      reference: `${seedPrefix}-TRF-${Date.now() + 1}`,
      type: 'TRANSFER',
      amount: 150,
      status: 'COMPLETED',
      sender_user_id: userId,
      receiver_user_id: otherUserId,
      idempotency_key: `${seedPrefix}-TRF`,
      created_at: now,
    }),
    txRepo.create({
      reference: `${seedPrefix}-WDR-${Date.now() + 2}`,
      type: 'WITHDRAWAL',
      amount: 80,
      status: 'FAILED',
      sender_user_id: userId,
      receiver_user_id: null,
      failure_reason: 'Insufficient funds',
      idempotency_key: `${seedPrefix}-WDR`,
      created_at: now,
    }),
  ];

  await txRepo.save(transactions);
}

async function seed() {
  await dataSource.initialize();

  const user1 = await ensureUser({
    phone_number: '+212600000001',
    full_name: 'Test Moroccan User',
    email: 'moroccan@test.com',
    risk_score: 15,
  });

  const user2 = await ensureUser({
    phone_number: '+212600000002',
    full_name: 'Test Foreign User',
    email: 'foreign@test.com',
    risk_score: 35,
  });

  const wallet1 = await ensureWallet(user1.id);
  const wallet2 = await ensureWallet(user2.id);

  await ensureLedgerBalance(wallet1.id, 500);
  await ensureLedgerBalance(wallet2.id, 1200);

  await ensureKycProfile(user1.id, {
    status: 'PENDING',
    level: 'TIER_1',
    provider: 'Sumsub',
    documents: { id_document: true, selfie: false, liveness: false },
    aml_screening: { status: 'PENDING', score: 0 },
  });

  await ensureKycProfile(user2.id, {
    status: 'APPROVED',
    level: 'TIER_2',
    provider: 'Sumsub',
    reviewedBy: 'seed',
    documents: { id_document: true, selfie: true, liveness: true },
    aml_screening: { status: 'CLEAR', score: 5 },
  });

  await ensureTransactions(user1.id, user2.id);
  await ensureTransactions(user2.id, user1.id);

  await dataSource.destroy();
  console.log('Seeded test users successfully.');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
