# Worker OCR mode contract

2026-10-03. The NDJSON worker now converts `ocr: "off"` and omitted OCR mode
to `ParseOptions.ocr = false`. Previously neither branch set the option, so
the PDF API's cached-model automatic OCR could run despite an off request.
`auto` and `force` retain their existing explicit mappings. The public parse
API's omitted-option behavior is unchanged.

Verification:

- A synthetic scanned-PDF worker regression failed before the fix with
  `request 1 ran OCR`, then passed with installed cached models.
- Worker and PDF automatic-OCR suites: 8 passed, no skips. They include Korean
  recognition and the existing API automatic-OCR behavior.
- Full suite: 2,753 passed, 5 skipped, zero failures after running outside the
  sandbox required by browser/watch/local-listener tests.
- Typecheck and build passed.
- Through the 02ontology adapter, a local scanned receipt reported no OCR in
  off mode and OCR_APPLIED with explicitly selected German auto mode. The
  German model files were verified against the existing pinned hashes.

This change does not modify PDF reading order, heading/table algorithms or
OCR weights. It is a worker option-dispatch correction, not an OCR accuracy
promotion. OpenDataLoader-200 scores were not remeasured; the private Korean
corpus gate remains unverified. No private document bytes or extracted text
are included in this repository.
