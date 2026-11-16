# V63 device OCR validation

No layout/CSS, database schema, permissions, customer matching, finance, quantity, weight, notes or original-photo storage changes. No paid OCR service. Original automatic-intake server requirements remain unchanged.

## Implementation

- Capture reads the visible guide's real DOM rectangle, maps cover offsets to native video pixels and then to the centered still sensor field of view. Geometry is frozen at shutter time, before the guide disappears. Original HD pixels are cropped; the displayed low-resolution preview is not OCR input. System-file input retains the previous center-guide mapping, because it has no live sensor geometry. Actual hardware FOV/EXIF/orientation remains a real-device check.
- The fast first pass does not upscale every image to 1800 pixels or run an unused deskew probe. It retains original pixels up to a bounded 1920×1400 working canvas. Existing higher-resolution enhancement/binary fallback remains available.
- After a valid first parse, actual OCR word boxes localize the name/phone within the already frozen frame. Subsequent independent enhancement/verification uses that small region, scaled from measured glyph height toward 48 pixels (bounded 0.25–2×), rather than inflating every small crop to 1800 pixels. If localization fails, full-frame enhancement remains the fallback. Evidence is not invented or duplicated.
- Recipient address suffixes and complete bracketed contact data take precedence. OCR angle-bracket confusion is normalized as punctuation; Burmese numeric codepoints normalize to decimal digits. Sender-only addresses, hidden/virtual numbers, competing customer blocks and unexplained extra customer lines remain manual. A separate routing-code/phone/destination-city row is not treated as the customer. No customer name/telephone is a runtime rule or OCR hint.
- Preserve real confidence when a word combines an address suffix with the name/phone, and preserve word bounding boxes. No confidence value is raised synthetically.
- Initialize the existing worker upon entering photo intake, share initialization and reuse it between captures. Heavy engines/models are still absent from the login/home initial load. Tesseract.js 6.0.1 / core 6.1.2 / Chinese+English fast models remain pinned. Upstream SIMD detection selects a same-origin external SIMD WASM loader; scalar fallback is shipped and tested. CSP is unchanged; no data-URL or external OCR connection is added.

## Automatic-intake gate review

The user explicitly requires automatic intake to remain. Therefore V63 does **not** stop after a single successful result if that would remove automatic intake, and it does not fake `agreement_count`, `ocr_variants` or manual confirmation. A first reliable result can fill fields immediately. Automatic intake still requires two genuine distinct consistent variants (field mean ≥95, minimum ≥90), original HD/ROI evidence, no corrected/hidden/conflicting/virtual fields, authorized customer resolution and the existing duplicate/recovery fences. The only following passes needed for a valid first result are small-region verification, not repeated whole-photo recognition.

A true single-evidence automatic-intake policy is **not introduced**. One compressed screenshot cannot justify relaxing server gates, particularly for automatic customer creation. No production SQL/RLS change is necessary. A future lower/one-pass policy needs a separately reviewed implementation, diverse original real labels and negative cases, isolated transaction/permission testing and a verified recovery path before any production schema change.

## Actual provided image

The user provided a real phone screenshot showing a frozen label, not the original native camera image. Its visible label region was cropped identically for baseline and candidate; no text was reconstructed or OCR-primed. Bitmap, contact ground truth and full OCR text are kept outside Git/deployment in a private workspace directory.

Baseline V62.4, scalar/full-photo three passes: two runs both failed correct extraction, approximately 6.5 seconds per run. The failure reproduced OCR opening-bracket confusion and mixing the next routing row's phone into recipient parsing.

Candidate actual WASM, first frame plus small-region verification:

| Browser | Run 1 | Run 2 | Correct recipient fields |
|---|---:|---:|---|
| Chromium | 580 ms | 524 ms | both correct |
| WebKit | 678 ms | 540 ms | both correct |

Local worker initialization was approximately 0.50–0.63 seconds in these runs; this excludes first-ever public-network model download. The 1–2 second target is met for this **one real screenshot ROI in cloud browsers**, not proven for actual phones or Myanmar carriers. Four additional synthetic names/formats, each twice, were correct; the existing six-format real-WASM regressions are also retained. These counts are not a general field accuracy percentage.

The screenshot has low field confidence and insufficient original HD provenance. It correctly remains **manual confirmation**, despite correct extraction. It is not an automatic-intake acceptance case. High-confidence HD automatic-intake behavior is preserved and exercised by camera/transport simulations plus unchanged isolated SQL gate tests; no real-device automatic creation or production writes are claimed.

## Reproducible private real-image test

`python tests/browser_v63_ocr.py --manifest /private/path/manifest.json --output /private/path/report.json`

Manifest format: `{"images":[{"path":"/private/path/frame.png","name":"expected name","phone":"expected phone","source":"real screenshot or original photo"}]}`. Expected fields are compared in Python **after** recognition, never sent to the engine. The output reports only image hash, correctness, timing, pass count and proof status, not contact text. Do not commit the manifest, images or private full-text debug logs. `--scalar` forces non-SIMD feature detection in the test-only local worker response, verifying the actual scalar fallback.

Local validation: 213 unit tests and syntax checks passed; disposable PostgreSQL V57–V62 RLS/permissions, duplicate/concurrency, freight/debt and rollback tests passed; built Chromium/WebKit camera orchestration, true two-variant automatic intake, recovery and manual controls passed. Production deployment requires all CI checks. Physical iPhone/Android camera capture, focus/orientation and original-HD real label tests remain unperformed and must be reported as such. Reopen the PWA to obtain new fingerprinted code; first model/core download may still be slow on weak networks.
