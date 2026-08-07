import { NestFactory } from '@nestjs/core';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../app.module';
import { StaysListing } from '../modules/stays/entities/stays-listing.entity';
import { StaysCheckInContact } from '../modules/stays/entities/stays-check-in-contact.entity';

async function encryptLegacyRows<T extends { id: string }>(
  dataSource: DataSource,
  entity: new () => T,
  table: string,
  column: string,
): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT id FROM ${table}
     WHERE ${column} IS NOT NULL AND ${column} NOT LIKE 'enc:v1:%'`,
  )) as Array<{ id: string }>;
  if (!rows.length) return 0;
  const repository = dataSource.getRepository(entity);
  const entities = await repository.findBy({
    id: In(rows.map((row) => row.id)),
  } as never);
  await repository.save(entities, { chunk: 100 });
  return entities.length;
}

async function main(): Promise<void> {
  if (!process.env.PII_ENCRYPTION_KEY) {
    throw new Error('PII_ENCRYPTION_KEY is required');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const dataSource = app.get(DataSource);
    const listings = await encryptLegacyRows(
      dataSource,
      StaysListing,
      'stays_listings',
      'address_encrypted',
    );
    const contacts = await encryptLegacyRows(
      dataSource,
      StaysCheckInContact,
      'stays_check_in_contacts',
      'phone_encrypted',
    );
    process.stdout.write(
      `Encrypted ${listings} listing addresses and ${contacts} check-in phone rows.\n`,
    );
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
