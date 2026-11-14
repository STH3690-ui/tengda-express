# V59 realtime address-tail intake

The primary home action opens realtime intake. Start explicitly opens the rear camera and enables automatic intake. A single Tesseract worker processes one cropped frame at a time; frames never upload, and another frame is scheduled only after the previous recognition finishes. The visible guide and source crop account for portrait/landscape cover cropping. Workers and media tracks stop on navigation/backgrounding. Recognition has a 25-second deadline; RPC calls have a 30-second deadline.

Only a complete name and phone at the end of an address block or a standalone suffix are candidates. Warehouse recipient fields, phone numbers registered in the existing station directory, masked values, address-shaped names and trailing conflicting text remain manual. Chinese names, English names, mainland China and Myanmar phones use the existing canonical phone normalizer. V59 matches English-name case and whitespace variations to the original stored name, without rewriting existing names or relaxing conflict/archival checks. No shipping waybill or weight is required.

Three consecutive matching, high-confidence target observations (target average >=95, minimum word >=90, at least 1.2 seconds) may commit automatically after authoritative customer matching and permission checks. This is a conservative routing threshold, not proof OCR can never be wrong. Low-confidence labels remain manual even if the text looks correct. Clear photos and keeping the address suffix inside the guide matter.

## Physical-package ambiguity

A camera cannot reliably distinguish two physically different parcels with identical printed customer/address text. After each successful intake, the presentation is latched until three no-candidate observations. The same customer cannot automatically create another parcel in that session; the server also detects repeated label digests and recent same-actor/customer entries. A second real parcel with identical customer data requires the one explicit “confirm another parcel” action. That action creates a different generated parcel number. It never bypasses customer conflicts, permissions or request idempotency. Stop/reload does not grant permission to replay an uncertain request: UUID-only session recovery and a backend late-request fence protect against retries.

Server number: TD59 + request UUID without hyphens. Parcel defaults: one piece, zero intake weight; V57 pickup still uses actual unified weight, rate, payment and debt. Customer creation requires existing customer_create permission and conflict-free name/phone matching. The original V57/V58 manual/photograph/barcode flows are retained under the traditional-intake disclosure. Existing customer, employee and financial records are not rewritten.

## Validation

- `npm test && npm run check`
- `TD_TEST_V58=1 TD_TEST_V59=1 timeout 120s node scripts/test-scan-db.mjs`
- `python tests/browser_v59.py` and `TD_BROWSER_ENGINE=webkit python tests/browser_v59.py`: simulated media/OCR/business transport, checking continuous camera orchestration, same-presentation blocking, distinct-parcel confirmation, offline blocking, lost responses, recovery, denied camera and stream disposal.
- `python tests/browser_v58_ocr.py` (both engines): real shipped WASM file and canvas paths under shipped CSP. The V59 fixture deliberately includes warehouse recipient/phone and an address-tail customer. It must select the latter. Confidence output is logged honestly; insufficient confidence must not be treated as auto-accepted.
- Existing V57 scan/navigation and V58 interaction suites remain active; they explicitly open the traditional disclosure when testing legacy controls.
- Disposable DB tests inject installation/late request failures, race two independent connections, verify no orphan customers/parcels or partial ledger writes, exercise same-client multiple parcels and unified pickup/debt, and deny anonymous/restricted accounts.
- Hosted isolated Supabase exercise uses synthetic Auth/member/customer/parcel/ledger fixtures entirely within BEGIN/ROLLBACK. No test business records remain.

## Release

Apply only the incremental V59 migration after green current-head CI and database-object/backup review. Never rerun V57/V58 on production. The new migration adds a private RLS request table and four authenticated, active-member/permission-checked RPCs; it changes no existing business rows. On precommit failure, rollback. After installation, revert the frontend first for a release issue and preserve request/business history; do not automatically drop objects or Restore the database.

## Actual-device checks still required

Real iPhone Safari/PWA and Android hardware are not simulated by WebKit/Chromium CI. Check rear-camera permission and preview framing, rotation, camera focus and readability, stable suffix auto-entry, a same-client second parcel confirmation, vibration/sound after the start gesture, background/resume, low memory, airplane-mode request recovery, and traditional barcode pickup with actual unified weighing. iPhone vibration support varies; sound/visible confirmation remain available. An Android TWA uses the existing verified web origin; no paid OCR, new cloud project or native app rebuild is required for these web changes.
