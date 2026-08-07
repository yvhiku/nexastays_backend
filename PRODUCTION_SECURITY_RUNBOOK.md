# Nexa Stays production security runbook

Payment gateway activation is intentionally outside this checklist.

## Required production controls

- Use Node.js 20 or newer and immutable container images.
- Terminate TLS at the load balancer and redirect HTTP to HTTPS.
- Set exact `CORS_ORIGINS`; never use `*` with credentialed requests.
- Set `AUTH_COOKIE_DOMAIN=.nexastays.ma` (or the actual parent domain).
- Set `DB_SSL=true`, keep `DB_SSL_REJECT_UNAUTHORIZED=true`, and set
  `DB_SYNCHRONIZE=false`.
- Supply a different, random `INTERNAL_SERVICE_KEY` to each environment.
- Supply RS256 JWT keys and rotate them through the documented JWKS process.
- Supply a base64-encoded 32-byte `PII_ENCRYPTION_KEY` from the deployment
  secret manager. Do not place it in source, images, CI variables printed to
  logs, or local `.env` files.
- Media production must use S3-compatible object storage, a private bucket,
  HTTPS `MEDIA_PUBLIC_BASE_URL`, and a random `MEDIA_SIGNING_SECRET`.
- Keep Swagger disabled unless it is protected on a private network.

## Database and PII rollout

1. Take and verify an encrypted database backup.
2. Apply database migrations, including
   `060_kyc_pii_encryption_columns.sql`.
3. Deploy code that can read both legacy plaintext and `enc:v1` ciphertext.
4. Run `npm run security:encrypt-pii` in `identity` and `stays` with the
   production encryption key injected by the secret manager.
5. Run both commands again; each must report zero legacy rows.
6. Verify with read-only SQL that protected columns are either null or begin
   with `enc:v1:`.
7. Retain the previous key during a rotation until all values have been
   decrypted and re-encrypted with the new key. A key rotation must use a
   maintenance job and a tested backup; changing the environment value alone
   makes existing ciphertext unreadable.

## Release gates

- All repository CI checks must pass: production dependency audit, build,
  tests, Gitleaks, and CodeQL.
- Run authenticated and unauthenticated DAST against staging.
- Test upload polyglots, oversized files, path traversal names, invalid magic
  bytes, and unsafe content disposition.
- Verify browser storage contains no access or refresh tokens. Confirm refresh
  and access cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Verify unsafe cookie-authenticated requests with a missing or unapproved
  `Origin` receive HTTP 403.
- Verify rate limiting at both the edge and application layers.
- Test backup restore into an isolated account and record recovery time.
- Exercise rollback of application images and forward-only database recovery.

## Monitoring and incident response

- Alert on authentication failure spikes, refresh-token reuse, admin login
  failures, 403 origin failures, upload rejection spikes, and throttling.
- Centralize immutable audit logs with restricted access and retention.
- Never log authorization headers, cookies, OTPs, PINs, national IDs, upload
  signing secrets, or database credentials.
- On suspected credential theft: revoke refresh families, rotate affected
  secrets, invalidate sessions, preserve audit evidence, and follow the breach
  notification procedure.

Production approval requires recorded evidence for every release gate. A
successful local build alone is not production approval.
