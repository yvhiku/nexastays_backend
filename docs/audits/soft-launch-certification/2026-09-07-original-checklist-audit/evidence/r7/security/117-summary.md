# 117 — Dangerous upload types rejected — PASS

Evidence: `117-upload-reject.txt`

Authenticated `POST /api/v1/stays/host/listings/media/photo`:
- SVG (`image/svg+xml`) → **400** `Invalid image. Use JPEG, PNG, or WebP`
- EXE/octet-stream → **400** same

Matches R4 host-media rejection pattern on live dogfood.
