# Office/PDF evaluation fixtures

These six inputs are synthetic. Their SHA-256 values are pinned in
`bench/office-pdf-manifest.json`; the benchmark checks the bytes before parsing.

- `text-native.pdf`, `table-heavy.pdf`, `layout-mixed.pdf`, and
  `sealed-gold.json` come from `timothyc012/02ontology` commit
  `73b8344d6c763b2cb67c267c59ec66c1dd3589f6`, under
  `tests/fixtures/horizon_pdf_quality/`.
- `financial-register-2026.xlsx` comes from the same commit under
  `tests/in01/corpus/`.
- `hgb-posting-lines.xlsx` is a fictional 01ontology conformance workbook.
  Its own README sheet explicitly states that it contains no real ledger data.
- `image-only-scan.pdf` is the generated, image-only English scan from the
  2026-09-29 multiformat evaluation. It contains no private source document.

The other 14 documents are external public sources. The evaluator reads them
from `bench/corpus/office-pdf/` (gitignored) and requires exact hashes.
