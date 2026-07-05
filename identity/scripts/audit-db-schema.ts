/**
 * Compare TypeORM entity columns (database.module entities) vs live Postgres schema.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/audit-db-schema.ts
 */
import 'dotenv/config';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { User } from '../src/modules/users/entities/user.entity';
import { UnifiedIdentity } from '../src/modules/users/entities/unified-identity.entity';
import { IdentityPhoneNumber } from '../src/modules/users/entities/identity-phone-number.entity';
import { ReusableIdentityVerification } from '../src/modules/users/entities/reusable-identity-verification.entity';
import { IdempotencyKey } from '../src/modules/users/entities/idempotency-key.entity';
import { UserConsent } from '../src/modules/users/entities/user-consent.entity';
import { KycProfile } from '../src/modules/compliance/entities/kyc-profile.entity';
import { TransactionLimit } from '../src/modules/compliance/entities/transaction-limit.entity';
import { SarReport } from '../src/modules/compliance/entities/sar-report.entity';
import { KycTierPolicy } from '../src/modules/compliance/kyc-policy/entities/kyc-tier-policy.entity';
import { KycAdminOverride } from '../src/modules/compliance/kyc-policy/entities/kyc-admin-override.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { RiskAlert } from '../src/modules/admin/entities/risk-alert.entity';
import { OtpCode } from '../src/modules/auth/entities/otp-code.entity';
import { OtpSession } from '../src/modules/auth/entities/otp-session.entity';
import { OtpAttempt } from '../src/modules/auth/entities/otp-attempt.entity';
import { PinAttempt } from '../src/modules/auth/entities/pin-attempt.entity';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { TrustedDevice } from '../src/modules/auth/entities/trusted-device.entity';
import { PushDeviceToken } from '../src/modules/notifications/entities/push-device-token.entity';
import { SecurityEvent } from '../src/modules/security-events/entities/security-event.entity';
import { FraudEvent } from '../src/modules/fraud/entities/fraud-event.entity';

const entities = [
  User,
  UnifiedIdentity,
  IdentityPhoneNumber,
  ReusableIdentityVerification,
  IdempotencyKey,
  UserConsent,
  KycProfile,
  TransactionLimit,
  SarReport,
  KycTierPolicy,
  KycAdminOverride,
  AuditLog,
  RiskAlert,
  OtpCode,
  OtpSession,
  OtpAttempt,
  PinAttempt,
  RefreshToken,
  TrustedDevice,
  PushDeviceToken,
  SecurityEvent,
  FraudEvent,
];

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    username: process.env.DB_USERNAME || 'nexa_identity',
    password: process.env.DB_PASSWORD || 'nexa_identity_dev',
    database: process.env.DB_NAME || 'nexa_identity',
    entities,
    synchronize: false,
  });
  await ds.initialize();

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    user: process.env.DB_USERNAME || 'nexa_identity',
    password: process.env.DB_PASSWORD || 'nexa_identity_dev',
    database: process.env.DB_NAME || 'nexa_identity',
  });
  await client.connect();

  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' ORDER BY table_name, column_name`,
  );
  const dbCols = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!dbCols.has(r.table_name)) dbCols.set(r.table_name, new Set());
    dbCols.get(r.table_name)!.add(r.column_name);
  }

  const missing: { table: string; column: string }[] = [];
  const missingTables: string[] = [];

  for (const entity of entities) {
    const meta = ds.getMetadata(entity);
    const table = meta.tableName;
    const cols = dbCols.get(table);
    if (!cols) {
      missingTables.push(table);
      continue;
    }
    for (const col of meta.columns) {
      if (!cols.has(col.databaseName)) {
        missing.push({ table, column: col.databaseName });
      }
    }
  }

  await client.end();
  await ds.destroy();

  if (missingTables.length) {
    console.log('MISSING TABLES:');
    for (const t of missingTables) console.log(`  - ${t}`);
  }
  if (missing.length) {
    console.log('MISSING COLUMNS:');
    for (const m of missing) console.log(`  - ${m.table}.${m.column}`);
  } else if (!missingTables.length) {
    console.log('All entity columns present in database.');
  }
  process.exit(missing.length || missingTables.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
