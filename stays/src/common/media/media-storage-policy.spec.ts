import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { LocalMediaStorageBackend } from './local-media-storage';
import {
  assertProductionMediaStorageConfigured,
  assertSafeRelativeStorageKey,
  isSvgBuffer,
  normalizeRelativeMediaKey,
} from './media-storage-policy';
import { detectImageType } from '../utils/image-type.util';

describe('PROD-SEC-002 media storage policy', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('fails closed when NEXA_ENV=production without MEDIA_SERVICE_URL', () => {
    process.env.NEXA_ENV = 'production';
    delete process.env.MEDIA_SERVICE_URL;
    delete process.env.MEDIA_ALLOW_LOCAL_STORAGE;
    expect(() => assertProductionMediaStorageConfigured()).toThrow(
      /MEDIA_SERVICE_URL/,
    );
  });

  it('rejects MEDIA_ALLOW_LOCAL_STORAGE in production', () => {
    process.env.NEXA_ENV = 'production';
    process.env.MEDIA_SERVICE_URL = 'https://media.example';
    process.env.MEDIA_ALLOW_LOCAL_STORAGE = 'true';
    expect(() => assertProductionMediaStorageConfigured()).toThrow(
      /MEDIA_ALLOW_LOCAL_STORAGE/,
    );
  });

  it('passes when production has MEDIA_SERVICE_URL', () => {
    process.env.NEXA_ENV = 'production';
    process.env.MEDIA_SERVICE_URL = 'https://media.example';
    delete process.env.MEDIA_ALLOW_LOCAL_STORAGE;
    expect(() => assertProductionMediaStorageConfigured()).not.toThrow();
  });

  it('rejects path traversal keys', () => {
    expect(() => normalizeRelativeMediaKey('../etc/passwd')).toThrow(
      /Invalid storage key/,
    );
    expect(() =>
      assertSafeRelativeStorageKey('/tmp/uploads', '../../etc/passwd'),
    ).toThrow(/Invalid storage key/);
  });

  it('detects SVG buffers for rejection', () => {
    expect(isSvgBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
      true,
    );
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
});

describe('LocalMediaStorageBackend', () => {
  let root: string;
  let backend: LocalMediaStorageBackend;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexa-media-'));
    backend = new LocalMediaStorageBackend(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores a JPEG under a server-built relative key', async () => {
    const assetId = randomUUID();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const relativeKey = `host/user-a/listing/photo_${assetId}.jpg`;
    const stored = await backend.store({
      buffer: jpeg,
      relativeKey,
      mimeType: 'image/jpeg',
      assetId,
    });
    expect(stored.storageKey).toBe(relativeKey);
    expect(await backend.exists(relativeKey)).toBe(true);
    const delivery = await backend.resolveDelivery(relativeKey);
    expect(delivery.startsWith(root)).toBe(true);
  });

  it('does not allow overwrite of another user namespace via traversal', async () => {
    await expect(
      backend.store({
        buffer: Buffer.alloc(12, 1),
        relativeKey: 'host/user-a/../user-b/listing/photo_x.jpg',
        mimeType: 'image/jpeg',
        assetId: randomUUID(),
      }),
    ).rejects.toThrow(/Invalid storage key/);
  });

  it('user A object is not readable via user B key', async () => {
    const assetId = randomUUID();
    const relativeKey = `host/user-a/listing/photo_${assetId}.jpg`;
    await backend.store({
      buffer: Buffer.alloc(12, 2),
      relativeKey,
      mimeType: 'image/jpeg',
      assetId,
    });
    expect(await backend.exists(`host/user-b/listing/photo_${assetId}.jpg`)).toBe(
      false,
    );
  });

  it('delete is scoped to the relative key', async () => {
    const assetId = randomUUID();
    const relativeKey = `host/user-a/listing/photo_${assetId}.jpg`;
    await backend.store({
      buffer: Buffer.alloc(12, 3),
      relativeKey,
      mimeType: 'image/jpeg',
      assetId,
    });
    await backend.delete!(relativeKey);
    expect(await backend.exists(relativeKey)).toBe(false);
  });
});
