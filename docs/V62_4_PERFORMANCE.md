# V62.4 performance validation

Baseline: V62.3 main `02b057bab161e58032fddf4fd95ccb17ab368add`. Measured 2026-11-16. This release needs no database migration.

## Changes

- ZXing and Tesseract scripts load only when a barcode/image consumer asks for them. Failed downloads can retry; concurrent loads share one promise. The Chinese/English models, quality thresholds and reusable OCR worker are unchanged.
- Login validates active membership and permissions before displaying the workspace. The workspace does not wait for business history. Unloaded overview values display `—`, never false zero totals.
- Customers, orders, parcels and business record search fetch at most 51 rows per source (50 visible plus a next-page sentinel), with stable date/ID ordering, server search and global order/category filtering before pagination, 300 ms debounce, timeout, private per-session cache and stale-result rejection. Successful photo intake immediately invalidates cached lists. Record search pages each source independently. Empty pages can occur when hidden rows are excluded; continue with Next.
- Related orders/parcels load completely **for the selected customer**, including historical multi-order parcel links. Limits fail visibly instead of silently declaring a partial relation complete.
- Financial/settlement/report views retain a separate complete snapshot. Six independent table reads and visibility reads run concurrently. Concurrent refreshes share the same request, and session changes prevent old results from repopulating a signed-out view. Existing full-read safety limits are retained. Financial exports and totals never use list-page subsets.
- After a full snapshot, business/payment lists still render only 50 records per page. Legacy customer/order selectors and accounting snapshots can remain large; this release does not claim constant memory for arbitrarily large financial history.
- New uploads produce a small JPEG thumbnail on the device, in the same private bucket under `.thumbs/`. Original bytes, names and paths are preserved. Galleries batch signing, lazy-load and asynchronously decode thumbnails. Existing photos without a thumbnail fall back to their original; no historical private files were downloaded, modified or deleted. No paid image-transformation endpoint is used.
- Classic scripts and styles are minified into content-hashed assets, preserving global handlers and CSS order. Hashed assets have immutable caching. Login artwork uses a small WebP; original Android/PWA identity icons remain byte-for-byte unchanged.
- A release-specific PWA shell supports offline startup with a 3-second navigation fallback. CacheStorage never stores Auth/API/business responses or signed photos, and never preloads OCR models. A new worker waits for old clients to close; it does not force an update while a form is open. Offline business writes are not queued or replayed.

## Reproducible controlled measurements

Three cold Chromium runs per profile, 390×844 viewport, service workers blocked for a consistent cold-network comparison. Local HTTP server uses gzip for text resources; these are **browser simulations, not measurements on physical phones or Myanmar mobile networks**. Load time is the navigation load-event timing, not a guaranteed field INP/TTI score.

| Metric | V62.3 | V62.4 |
|---|---:|---:|
| Regular: 40 ms RTT, 10 Mbps, native CPU; median load | 767 ms | 283 ms |
| Weak: 150 ms RTT, 1.5 Mbps, 4× CPU slowdown; median load | 4,338 ms | 1,212 ms |
| Initial requests | 32 | 5–6 (favicon timing varies) |
| Initial transferred bytes | 739,859 | approximately 145,000 |
| Decoded resource bytes | 1,312,042 | approximately 491,000 |
| Eager barcode/OCR engine scripts | 2 | 0 |

Run `python scripts/benchmark-performance.py <static-directory> <localhost-port> <output-json>` against a clean V62.3 checkout and the built V62.4 `dist` directory. Performance logs are kept outside the public deployment allowlist.

Authenticated route comparison uses identical synthetic data: 1,205 rows per business table, 100 ms per simulated backend read, three runs. Static resources have already loaded; this measures workspace/data/render behavior, **not a real authenticated Supabase latency measurement**.

| Native CPU median | V62.3 | V62.4 |
|---|---:|---:|
| Enter usable workspace after login | 1,821 ms / 18 reads | 105 ms / 1 membership read |
| First customer page | 409 ms | 221 ms |
| First order page | 530 ms | 246 ms |
| First parcel page | 628 ms | 226 ms |
| Business record page | 62 ms (history preloaded at login) | 213 ms (history loaded on demand) |
| First settlement page | 33 ms (history preloaded at login) | 425 ms (complete snapshot loaded on demand) |
| Payment page | 204 ms | 77 ms |
| Dashboard | 35 ms | 35 ms |
| Settings | 14 ms | 16 ms |

At 4× CPU slowdown, customer/order/parcel pages were approximately 252/327/295 ms; payment page 235 ms. First complete settlement load was 532 ms, so the 500 ms target is not met for every cold accounting route. The target cannot be guaranteed for an actual phone/network without field measurements.

## Validation and boundaries

- `npm test`: 192 passed; `npm run check`: passed.
- Disposable local PostgreSQL: V57–V62 schema, RLS, anonymous/staff isolation, duplicate protection, concurrency, freight/debt calculations and late-failure rollback passed. No production SQL migration or business writes are part of this release.
- Chromium/WebKit: paginated built bundle with 1,205-row fixtures, server search, customer relations, complete financial snapshots, duplicate refresh rejection, stale-session cancellation and initial staff permissions.
- Existing barcode/photo/manual intake, pickup, navigation, customer/order relations and deletion protections are regression tested with mocked transport; production data is not used as test fixtures.
- Actual shipped Tesseract WASM: six synthetic label formats (parentheses, plus, joined name/phone, multiline, English and tilted). One worker reused. These are not real-label field accuracy claims.
- Real service worker: install, offline anonymous shell and reconnection; private paths absent from cache.
- Production login/static release verification and GitHub CI must be recorded with the deployed commit after merge. Physical iPhone/Android camera, thermal/memory behavior and Myanmar carrier tests remain manual.

## Read-only database observations

Existing production indexes include customer lookup indexes on orders/parcels and the normalized tracking index. No index or RLS changes were made. Supabase's performance advisor also reports pre-existing schema-wide findings: 26 unindexed foreign keys, 5 RLS init-plan warnings, 53 tables without primary keys, 12 unused-index notices, 1 multiple-permissive-policy warning, 2 duplicate-index warnings and 1 Auth connection-setting notice. They include legacy tables and require separate workload/schema review; this frontend release does not claim to have resolved them. See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

Manual follow-up: close all old PWA tabs once to activate the prepared cache release; test cold/warm login on Wi-Fi and Myanmar mobile data, rear camera/album/torch, one real Chinese and one English/Myanmar label, manual correction, duplicate intake, airplane mode and reconnect. Confirm existing photos open at original resolution and a new photo has a thumbnail. Do not create test financial records in production solely for this check.
