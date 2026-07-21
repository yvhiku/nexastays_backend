# Media Storage Audit

**Score: 8.0/10**

## Asset types

| Asset | Storage | Access | Service |
|-------|---------|--------|---------|
| Listing photos | Local `uploads/` or remote | Public if LIVE listing | StaysService, host listings |
| Messaging attachments | Media service / signed URLs | HMAC signed, time-limited | messaging-media.service.ts |
| Profile avatars | Identity profile_photo_url | Identity API + signed proxy | identity-profile-photo.client |
| Review media | stays_review_media | Public if review published | reviews.controller |
| Host application docs | stays assets | Host/admin scoped | host onboarding |

## Security checks

| Check | Status |
|-------|--------|
| MIME validation | Partial — verify upload filters |
| Size limits | Multer limits — pinned 2.2.0 on stays/identity |
| Path traversal | Uses controlled paths — verify |
| Signed URL expiry | messaging-media — HMAC + expiry |
| Dev signing secret fallback | **SEC-003** — `nexa-messaging-media-dev` if env missing |
| Private vs public | Listing draft not exposed — OK |
| Orphan cleanup | attachment-cleanup.scheduler daily — OK |
| Virus scan | **Not implemented** — P2 hook |
| Prod object storage | `remote-media-storage.ts` exists — verify prod config |

## Launch blockers

- SEC-003: Dev secret + localhost base URL for signed media in prod misconfig

## Recommendations

1. Require `MESSAGING_MEDIA_SIGNING_SECRET` in prod (fail boot)
2. Move listing uploads off local disk for prod (S3-compatible)
3. Document signed URL TTL and rotation runbook
