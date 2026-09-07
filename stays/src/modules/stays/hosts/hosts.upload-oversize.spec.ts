import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HostsService } from './hosts.service';

describe('HostsService upload size gate (audit 092)', () => {
  let service: HostsService;
  const mediaStorage = { store: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HostsService(
      {} as never,
      {} as never,
      mediaStorage as never,
    );
  });

  it('rejects oversize host verification photo (>5MB)', async () => {
    const file = {
      buffer: Buffer.alloc(16),
      size: 5 * 1024 * 1024 + 1,
      mimetype: 'image/jpeg',
      originalname: 'big.jpg',
    } as Express.Multer.File;

    await expect(
      service.uploadDocumentFront('user-1', file),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mediaStorage.store).not.toHaveBeenCalled();
  });
});
