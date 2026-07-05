# User Data Rights Retention Strategy

## Scope

This strategy applies to account deletion requests and data export operations.

## Account Deletion Request Flow

1. User submits deletion request with re-authenticated PIN.
2. Backend marks user as `deletion_status=PENDING`.
3. `deletion_requested_at` and `deletion_scheduled_for` are stored (30-day retention window).
4. PII is anonymized immediately where allowed:
   - `full_name` -> `Deleted User`
   - `email` -> empty value
   - `city` -> `null`
   - `date_of_birth` -> `null`
   - `profile_photo_url` -> `null`
   - `phone_number` -> anonymized pseudonymous value
5. Access is revoked by invalidating active refresh tokens.

## Retention Rules

- Keep financial and ledger data for compliance and audit obligations:
  - Ledger entries
  - App transactions
  - Audit logs
- Remove or anonymize user-identifying profile data where regulation permits.
- Maintain immutable audit trail of deletion request event.

## Data Export

- User can request data export after PIN re-authentication.
- Export includes profile attributes and transaction history.
- Formats:
  - CSV
  - PDF

## Compliance Logging

Audit events emitted:

- `DATA_EXPORT_REQUESTED`
- `ACCOUNT_DELETION_REQUESTED`

Each event includes actor, timestamp, and request context metadata.
