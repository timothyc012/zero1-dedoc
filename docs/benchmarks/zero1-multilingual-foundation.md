# Zero1 Dedoc multilingual foundation evidence

**Date:** 2026-09-29. **Parser base:** [Kordoc v4.16.1](https://github.com/chrisryugj/kordoc/commit/878b7009a97a1e7d0f37e304ad2046b6d7916818). **Benchmark source:** [OpenDataLoader benchmark](https://github.com/opendataloader-project/opendataloader-bench/commit/7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109). Public ground truth and evaluator were not edited.

## English-heavy public benchmark

The same 200 PDFs were parsed before and after the German PDF changes. Both runs used `bench/odl-bench.mjs` with `KORDOC_OFFLINE=1` and an empty isolated `HOME`, so the OCR model cache was absent. The unmodified `src/evaluator.py --engine kordoc` then scored both outputs. The `kordoc` engine directory name is retained by the inherited prediction script; the second run contains Zero1 Dedoc predictions.

| Metric | Upstream base | Zero1 Dedoc | Difference |
| --- | ---: | ---: | ---: |
| Overall | 0.93705155 | 0.93705155 | 0 |
| Reading order (NID) | 0.93802742 | 0.93802742 | 0 |
| Table structure (TEDS) | 0.93569940 | 0.93569940 | 0 |
| Heading hierarchy (MHS) | 0.93264864 | 0.93264864 | 0 |

All **200/200 PDFs** parsed in each run. The seven per-document score fields are identical for all 200 documents; 0 improved, 0 regressed. The table metric has 42 scored documents and heading metric 107 according to the public evaluator. [Baseline evaluation JSON](data/kordoc-v4.16.1-odl200.json) · [Zero1 evaluation JSON](data/zero1-dedoc-odl200.json).

This is evidence of **non-regression** on an English-heavy public corpus, not measured English-language improvement. Kordoc's preexisting score is already high on this corpus. The full benchmark is separate from the German failure cases and from the private Korean corpus.

## German official documents

Two public, text-layer PDFs were parsed with `ocr:false` and `images:false`. The smoke script checks their complete SHA-256 hashes before scoring, so a source update cannot silently change the result.

| Input | Source and hash | Assertion |
| --- | --- | --- |
| 2026 August tax tables | [German Federal Ministry of Finance PDF](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/2026-09-22-steuereinnahmen-august-2026.pdf?__blob=publicationFile&v=2), SHA-256 `1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2` | Pages 1–3 remain separate 47×7, 50×7, and 44×7 tables. Page 1's `Lohnsteuer`, `Zölle`, and final `Steuern insgesamt ohne Gemeindesteuern` rows retain all six values in their correct columns; values were compared with the official [XLSX](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/2026-09-22-steuereinnahmen-august-2026-xlxs.xlsx?__blob=publicationFile&v=2). |
| Solvency forms | [German Ministry of Justice PDF](https://www.gesetze-im-internet.de/normengrafiken/bgbl1_2024/j0414-172_0010.pdf), SHA-256 `9fb138c73c0d7065203e1ed30a90d2febb3a2ab94a980cb31e679ce49f1ddda6` | Full 29-page parse retains each `Formular F.701.01` through `F.705.01` exactly once and a six-column table from page 2. |

Command after `npm run build`:

```sh
npm run bench:german-smoke -- /path/to/bmf-tax-tables.pdf /path/to/solvency-forms.pdf
```

One isolated Apple M4 local smoke run passed in 401 ms for the 11-page tax PDF and 281 ms for the 29-page form PDF, peak Node RSS 249 MiB. These are observed wall times, not a controlled engine-to-engine speed comparison.

The packed `zero1-dedoc@4.16.1-zero1.1` tarball from commit `92e2d6c` was also installed into an isolated **WSL Docker Node 20.20.2** image (`02ontology/zero1-dedoc-eval:92e2d6c`, image ID `sha256:1ad57e9a3d97b308558e247cb008f667b997da82feac416a047e89f342caf1b0`) with PDF.js and no optional OCR/model packages. With `--network none`, the same two official PDFs passed all table/value/form-title assertions; observed peak Node RSS was 182 MiB. The text-layer result was correct despite PDF.js warning that optional canvas rendering was unavailable in this lean image. The existing 02ontology operating Compose was not changed.

The follow-up package was tested in a new WSL Docker image `02ontology/zero1-dedoc-eval:final-20260929` (Node 20.20.2, `--network none`). Both hash-pinned PDFs passed again, including the final seven-cell tax total. Peak Node RSS was 177 MiB. The image reuses the previous image's installed dependencies and replaces its Zero1 Dedoc package contents with the newly packed tarball; it is an evaluation image, not a production deployment.

The current `4.16.1-zero1.1` package was rebuilt once more in local Docker
Desktop from the same pinned tarball. Image
`02ontology/zero1-dedoc-eval:latest-20260929` uses Node 20.20.2 and has digest
`sha256:9f6d314199592ceb2bdfd3806b04ee7094ecb48e50dd70801f98a57c2a0cb2c8`.
With `--network none` and the bounded `parse-worker` protocol:

- An English text-layer fixture retained `HORIZON CLEAN AVIATION 2026`, the
  topic budget heading, and the `HE-CL4-2026-01` row.
- A German text-layer fixture retained `Schäferstraße Köln – Fußgängerzone`,
  `0420`, `0970`, and `123,45 EUR`.
- The German tax-table page parsed successfully with `Gemeindesteuern`,
  `Lohnsteuer`, and `1.449.637` present in the 5,686-character Markdown result;
  peak worker RSS was 125,431,808 bytes.
- An image-only German scan returned the expected `OCR_FAILED` and `NEEDS_OCR`
  warnings because the lean evaluation image intentionally omits optional
  PDFium/OCR model packages. It did not download anything or silently claim
  OCR success.

The image is an evaluation artifact, not a production deployment. The WSL
address used by the earlier run was unavailable during this repeat; the local
Docker result verifies the same network-isolated package and worker contract.

Cross-page ruled tables now require a repeated header or matching caption before merging. This prevents unrelated tables with the same geometry and numeric column roles from merging. A genuine continuation without either cue may remain split; it needs a separate labeled test case before adding a looser rule.

## Korean and OCR coverage

The repository's follow-up `npm test` passed **2,610 tests**, with **10 skips** and **0 failures** after the table-continuation and missing-gridline fixes. The first sandboxed attempt failed six tests requiring localhost, Chromium, or filesystem watch; the same suite passed when allowed to use those resources. The private Korean PDF/HWPX corpus required by `npm run bench:gate` was not present in this checkout, so that gate is **unverified**. OCR is not part of these results. The bundled recognition model remains Korean PP-OCRv5; German and English scanned PDFs need a separate model-selection and gold-set evaluation.
