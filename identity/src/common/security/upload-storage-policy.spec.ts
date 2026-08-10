import {
  assertProductionIdentityUploadConfigured,
  assertIdentityLocalUploadsAllowed,
} from './upload-storage-policy';

describe('PROD-SEC-002 identity upload policy', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('fails closed in production without IDENTITY_DISABLE_LOCAL_UPLOADS', () => {
    process.env.NEXA_ENV = 'production';
    delete process.env.IDENTITY_DISABLE_LOCAL_UPLOADS;
    expect(() => assertProductionIdentityUploadConfigured()).toThrow(
      /IDENTITY_DISABLE_LOCAL_UPLOADS/,
    );
  });

  it('passes when production disables local uploads', () => {
    process.env.NEXA_ENV = 'production';
    process.env.IDENTITY_DISABLE_LOCAL_UPLOADS = 'true';
    expect(() => assertProductionIdentityUploadConfigured()).not.toThrow();
  });

  it('blocks upload methods when local uploads are disabled', () => {
    process.env.IDENTITY_DISABLE_LOCAL_UPLOADS = 'true';
    expect(() => assertIdentityLocalUploadsAllowed()).toThrow(
      /Local Identity uploads are disabled/,
    );
  });
});
