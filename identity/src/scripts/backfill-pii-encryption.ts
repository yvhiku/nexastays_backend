import { NestFactory } from '@nestjs/core';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../app.module';
import { KycProfile } from '../modules/compliance/entities/kyc-profile.entity';

async function main(): Promise<void> {
  if (!process.env.PII_ENCRYPTION_KEY) {
    throw new Error('PII_ENCRYPTION_KEY is required');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const dataSource = app.get(DataSource);
    const rows = (await dataSource.query(
      `SELECT id FROM kyc_profiles
       WHERE (national_id_number IS NOT NULL AND national_id_number NOT LIKE 'enc:v1:%')
          OR (national_id_number_extracted IS NOT NULL AND national_id_number_extracted NOT LIKE 'enc:v1:%')`,
    )) as Array<{ id: string }>;
    if (!rows.length) {
      process.stdout.write('No legacy KYC PII rows found.\n');
      return;
    }
    const repository = dataSource.getRepository(KycProfile);
    const profiles = await repository.findBy({ id: In(rows.map((row) => row.id)) });
    await repository.save(profiles, { chunk: 100 });
    process.stdout.write(`Encrypted ${profiles.length} KYC profile rows.\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'PII backfill failed'}\n`,
  );
  process.exitCode = 1;
});
