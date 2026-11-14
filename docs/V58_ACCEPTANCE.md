# V58 acceptance and release gates

V58 adds local, self-hosted Tesseract WASM OCR, conservative full-name/phone matching, transactional customer creation and parcel intake, and optimistic parcel editing. It uses no paid OCR service. V57 barcode intake, lookup, pickup and financial ledger remain the underlying workflow.

Automatic intake is opt-in per page session, requires OCR confidence >=97%, every recognized word >=90%, an independently decoded matching barcode, complete unmasked name and phone, no edited recognition, server-side unique customer match, and current permissions. Creating a customer is separately opt-in and requires customer_create. Any ambiguity, hidden number, historical duplicate or conflicting customer requires manual review. OCR confidence is a routing signal, not proof of correctness; real label/device acceptance remains required.

## Repeatable validation

- `npm ci && npm test && npm run check`
- `TD_TEST_V58=1 timeout 120s node scripts/test-scan-db.mjs`: local disposable PostgreSQL only; V57/V58 regression, installation failure rollback and repeat-install protection, customer/parcel/request atomicity, concurrent matching, duplicate intake, permissions, optimistic edit protection, batch settlement/debt and invalid payments.
- `node scripts/generate-scan-fixtures.mjs`
- `python tests/browser_v58.py`: mocked business transport; masked/conflicting labels, explicit manual confirmation, offline blocking, lost response/request fence, customer creation opt-in and post-commit photo upload.
- `python tests/browser_v58_ocr.py`: actual self-hosted worker/WASM/models under the shipped CSP, without TextDetector or createImageBitmap; synthetic label only. Pillow and DejaVuSans required.
- Repeat both scripts with `TD_BROWSER_ENGINE=webkit`; CI installs WebKit dependencies.
- Existing navigation, scan, smoke, staff deletion and history regression scripts remain enabled.
- `node scripts/build-static.mjs`: explicit static asset allowlist; SQL, tests, server source and private backups excluded.
- `cd vendor/tesseract-v6 && sha256sum -c SHA256SUMS`

The hosted test-project exercise creates synthetic Auth/member/customer/parcel/pickup fixtures inside a transaction and ends with ROLLBACK. Never run fixtures on production.

## Device acceptance still required

1. On iPhone Safari add the site to Home Screen. Log in with a test staff account in the isolated environment; confirm camera permission, rear-camera capture, JPEG/HEIC handling (unsupported formats must ask for JPEG), readable Chinese and Latin labels, rotate and resume.
2. Use an unmasked label with existing customer, a new customer with creation allowed, and a masked/unclear label. Verify exact name/phone/waybill before confirming. Low confidence or barcode disagreement must never automatically commit.
3. Scan the same label twice, then take two parcels for one customer consecutively. Confirm only one intake per waybill, correct pieces, freight, paid and debt. Try overpayment and an account without financial permission.
4. Turn on airplane mode before submission: no write. Interrupt the response after submission: reopen and resolve the request before retrying. Verify no duplicate parcel or payment.
5. Verify the saved parcel photo, then logout/login as a restricted account; no prior image/text/draft or unauthorized edit/finance action should remain.
6. Android TWA: verify the installed release certificate matches assetlinks.json, verified link opens full screen, camera picker works, back/background lifecycle and the same negative cases pass. Signing material must remain private.

## Production execution gates

Do not merge/deploy the release until current official database backup completion/status and recoverable window are verified, recovery readiness is established, private Storage photos have a separate verified backup, the precise authorized test-record IDs and their relations have a private backup, and real-device acceptance is complete. A backup list is not a successful restore rehearsal. No key belongs in logs, reports or this repository.

Once all gates pass, run only `20261114030303_v58_label_atomic_intake.sql` through the migration mechanism against the verified project. It is a single transaction with bounded lock/statement timeouts; old migrations are never rerun. An injected pre-commit failure must leave no V58 objects. Re-running the raw migration intentionally fails without replacing existing objects; the migration-history mechanism applies it once.

On pre-commit failure, roll back and leave V57 running. After a committed installation, prefer reverting the frontend to the previous deploy and leaving additive V58 records intact; do not drop request history or restore the whole production database to undo a frontend issue. A database restore affects later business writes and requires a separate recovery decision. Verify RPC schema-cache visibility, authenticated-only EXECUTE, private request-table denial, original business-row consistency and staff login before publishing.
