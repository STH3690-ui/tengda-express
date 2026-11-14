# V60 stable capture intake

V60 replaces the executable continuous-camera OCR entry with a stable-image capture flow. A 320x200 pixel-only probe measures mean brightness, Laplacian sharpness and motion against a fixed anchor every 125 ms. It performs no OCR. Good-quality frames must remain within the motion threshold for about one continuous second; gaps and stalled video timestamps reset stability. Track termination stops acquisition. Camera permission acquisition has a 20-second deadline.

On capture, the actual source region matching the preview guide is copied without upscaling into a bounded high-resolution canvas (up to 2800x2000), shown immediately and retained. A capture sound is requested, the video is hidden, and media tracks are released. One separate temporary grayscale/contrast/brightness-adjusted canvas is recognized by the existing free, same-origin Chinese/English Tesseract worker, with a 60-second deadline. The displayed original is not altered and no photo/frame is uploaded. Cancellation rejects OCR immediately and ignores late results; it must not hold the UI pending for the entire deadline.

The address-tail parser supports parentheses, joined names/numbers, Chinese/English names, China/Myanmar phones and line breaks within names/numbers. Warehouse/sender/tracking contexts, multiple candidates, masked numbers and suspicious virtual/extension numbers require review. Digit-like OCR characters O/0, I/l/1, S/5, B/8, Z/2 and Chinese zero yield review-only candidates; semantic phone corrections never automatically submit. Full-width digits, punctuation and whitespace normalization are formatting changes.

Automatic intake requires a reliable parse, target word confidence >=95/minimum >=90, a qualified frozen capture and conflict-free server matching. V60's additive RPC checks capture quality and duplicates, then delegates to the unchanged V59 transaction adapter. It records mode=frozen_capture_v60 and stable_frames=0: it does not pretend one image was three OCR frames. Customer creation still requires the original permission. Parcel number generation, one-piece/zero intake weight and unified-weight pickup/financial logic remain unchanged.

Failures retain the frozen original for manual edits or explicit rescan. A successful intake keeps name, phone and success visible and disables repeat submission. Only the explicit “scan next parcel” action reopens the camera. Existing same-client/label ambiguity may require confirming a different physical parcel, rather than guessing identity. UUID-only pending recovery and late-request fences remain active. Traditional barcode, V58 photo/manual and existing business pages are retained.

## Repeatable checks

- `npm test && npm run check`
- `TD_TEST_V58=1 TD_TEST_V59=1 TD_TEST_V60=1 timeout 120s node scripts/test-scan-db.mjs`
- `python tests/browser_v60.py` and `TD_BROWSER_ENGINE=webkit python tests/browser_v60.py`: simulated camera/transport/OCR, but real pixel stability calculations and actual one-second timing. Assertions cover blur/stalled video, frozen HD image and capture feedback before OCR resolves, no repeated OCR or second intake, explicit next, failure/manual editing, response-loss recovery and cancellation/late results.
- `python tests/browser_v58_ocr.py` (both engines): actual shipped WASM and CSP, English/Chinese/canvas paths and HD bracketed joined-name/phone fixture with warehouse fields. Low measured confidence is not reported as automatic acceptance.
- All existing V57 barcode/navigation/finance/security and V58 UI checks remain. The retired V59 continuous UI test is replaced by the new V60 lifecycle test; V59 database/dedup/ledger tests remain enabled.
- Local database exercises include mid-install/late-write rollback, invalid capture quality, review-only corrected/virtual numbers, canonical matching, same-client different parcel confirmation, concurrent deduplication, idempotency/fence and anonymous/staff denial.
- Hosted isolated Supabase exercise uses synthetic fixtures within BEGIN/ROLLBACK; no fixtures are kept and no production business writes are used for testing.

## Release and recovery

Apply only the V60 incremental RPC migration after current-head CI is green. It adds no business table and replaces no existing database function. Installation is a single transaction with 5-second lock and 60-second statement limits. Do not rerun old migrations, delete business rows, create paid resources or use Restore for this release. Preserve the existing original-data baseline. After commit, prefer reverting the frontend to V59 while retaining all request/business history; do not undo new parcel/customer records by restoring the entire database.

## Real devices not replaced by CI

No real iPhone Safari/PWA or Android TWA device is implied by WebKit/Chromium tests. Check actual focus, glare/brightness, framing/cropping, capture sound, physical motion and the one-second lock, HD preview zoom/readability, successful explicit next, failure retention/edit/rescan, background/permission loss, low memory, pending recovery and staff permissions with actual labels. Existing iPhone vibration limitations remain; audible and visible feedback are the intended capture signals. No benchmarked hardware speed, autofocus accuracy or physical vibration result is claimed without such testing.
