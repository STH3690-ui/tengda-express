Self-hosted, free OCR assets (no OCR network service).

- Tesseract.js 6.0.1: https://github.com/naptha/tesseract.js (Apache-2.0).
- Tesseract.js-core 6.1.2: https://github.com/naptha/tesseract.js-core (Apache-2.0; core-LICENSE).
- eng/chi_sim fast models: https://tessdata.projectnaptha.com/4.0.0_fast/ (Tesseract traineddata, Apache-2.0).
- Bundled JS retains its generated third-party LICENSE notices.

Models and workers are served from this site's own origin. Runtime OCR receives local canvas pixels; it does not upload photos. A separate, explicit normal Storage upload happens only after confirmed parcel creation.

SHA256SUMS records the shipped asset bytes; update it whenever vendored assets change.

The core uses the upstream non-embedded LSTM loader (.js plus same-origin .wasm), avoiding a data-URL fetch that WebKit rejects under connect-src self. No broad data: connection exemption is needed.
