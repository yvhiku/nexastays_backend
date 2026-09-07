# Regression results R2 2026-09-07T01:14:55Z
## Identity
tsc_build_exit:0
PASS src/modules/auth/otp-lockout.service.spec.ts
PASS src/modules/compliance/sumsub-webhook-auth.spec.ts
PASS src/modules/sms/sms.service.spec.ts
PASS src/modules/auth/otp-send-rate-limit.service.spec.ts
PASS src/modules/auth/logout-refresh-revoke.spec.ts
PASS src/modules/auth/security/browser-auth-cookies.spec.ts
PASS src/common/security/cors-origins.spec.ts

Test Suites: 7 passed, 7 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        0.756 s, estimated 1 s
Ran all test suites matching otp-lockout|otp-send-rate-limit|sms.service|logout-refresh|cors-origins|sumsub-webhook-auth|browser-auth-cookies.
## Stays
tsc_build_exit:0
PASS src/modules/stays/payments/mock-payment-confirm.spec.ts
PASS src/modules/support/support-tickets.service.spec.ts
PASS src/modules/stays/security/bola-payments.spec.ts
PASS src/modules/stays/hosts/hosts.upload-oversize.spec.ts
PASS src/modules/stays/services/booking-lifecycle-scheduler.service.spec.ts
PASS src/modules/stays/services/host-dashboard.service.spec.ts
PASS src/modules/stays/security/bola-listings.spec.ts

Test Suites: 7 passed, 7 total
Tests:       116 passed, 116 total
Snapshots:   0 total
Time:        0.915 s, estimated 1 s
Ran all test suites matching mock-payment-confirm|booking-lifecycle-scheduler|host-dashboard.service|hosts.upload-oversize|bola|support-tickets.service.
## Notifications
PASS src/fcm-data.spec.ts
PASS src/notification-mapper.spec.ts
PASS src/notification-orchestrator.service.spec.ts

Test Suites: 3 passed, 3 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        1.373 s, estimated 2 s
Ran all test suites.
[Nest] 60721  - 09/07/2026, 2:15:02 AM   DEBUG [NotificationOrchestratorService] Skip push for existing notification n-1 type=BOOKING_CONFIRMED
## Web

> nexa-stays-landing@0.1.0 check:locales
> node scripts/check-locale-parity.mjs

Locale parity OK — no unexpected EN fallbacks in fr.json or ar.json
✔ unknown param remains indexable (intentional policy) (0.068084ms)
✔ city multi-filter geo cursor and mixed tracking are noindex (0.102666ms)
✔ FR and AR query URLs canonicalize to same-locale base (0.076416ms)
✔ file validation rejects wrong type and oversize, accepts JPEG/PNG/WebP under 5 MB (0.333666ms)
✔ enqueuePhotos adds pending tiles with client ids and reports rejections (0.323084ms)
✔ markUploaded applies by id and is a no-op when the tile was removed (0.093042ms)
✔ remove revokes the blob preview and drops the tile (0.048583ms)
✔ reorder and move preserve upload status and ignore unknown ids (0.15625ms)
✔ cover falls back to the first tile and setCover is exclusive (0.1265ms)
✔ retryPhoto re-queues a failed tile only when it still has its file (0.082625ms)
✔ mediaBodyFromPhotos sends only uploaded tiles, in order, with sort_order = index (0.09025ms)
✔ hasUnfinishedUploads reflects pending/uploading only (0.070292ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 96.754166
