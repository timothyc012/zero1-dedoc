# Office, PDF, and scan development corpus

This gate freezes the 20 documents used in the September 2026 comparison: five DOCX, six XLS/XLSX, one PPTX, and eight PDFs. It is a **development regression corpus**, not the independent holdout needed to promote Zero1 as the default PDF backend. The list, source revisions, SHA-256 values, parser options, and baseline revision are in [`bench/office-pdf-manifest.json`](../../bench/office-pdf-manifest.json). Six synthetic inputs are bundled in `bench/fixtures/office-pdf/`; 14 public documents are fetched on demand into the ignored `bench/corpus/office-pdf/`. There are no private documents or machine paths in the committed inputs.

## Reproduce

From the repository root, build and run:

```sh
npm ci
npm run build
npm run bench:office-pdf -- --fetch --gate
```

`--fetch` downloads missing public files from the manifest and verifies their SHA-256 **before** saving or parsing. If a source moves, supply the byte-identical files in `bench/corpus/office-pdf/` and rerun without `--fetch`. The result is `bench/office-pdf-results.json` (ignored); use `--out /path/to/result.json` to keep another copy. `--gate` compares each quality metric with [`bench/office-pdf-baseline.json`](../../bench/office-pdf-baseline.json), detects a lower score or lost format support, and exits nonzero. It also requires the same manifest and evaluator hashes. A scoring-rule change requires a documented reason and both old and new per-document results before the baseline can be changed. The external ODL200 evaluator is separate and remains fixed.

The current recorded baseline is the BMF repair implementation commit `13e89c24064f0044bc3dd39864e6e29700ba553b` with `{ocr:false,images:false}`. The original `b357c44` baseline is preserved [here](data/zero1-office-pdf-baseline-b357.json). `--record-baseline` only works at the approved source revision named in the manifest. The baseline is a comparator for **regressions**, not a declaration that every quality metric passes.

## Measurements and interpretation

The evaluator reads OOXML source structure independently of Zero1. DOCX paragraphs and PPTX slide paragraphs are compared to output text for weighted exact-unit presence and document order. The DOCX math example also requires the exact `For $m=1$,` sequence. PPTX slide order comes from `presentation.xml` relationships rather than filenames; this does not yet prove visual reading order inside grouped shapes.

XLSX cells are read by workbook relationship, sheet number, cell address, stored type, raw value, formula cache, and merge range. The output is compared by sheet, with exact visible-cell counts separated by **source** type and a separate count for leading-zero string codes. The current IR/Markdown does not carry Excel cell type or original address, so `outputTypeMetadataAvailable:false` and `addressAligned:null` are explicit. A raw numeric exact miss can reflect intended date or number-format rendering; it is not by itself a parser error. Formula cache and merge counts are diagnostics pending address-level gold. The `.xls` example uses the paired, independently read `test.xlsx` fixture as source gold; this is recorded in its result.

PDF checks are document-specific: page counts; German press-release heading level and order; BMF first-three-page table geometry including two distinct tables on page 3; pension-form identifiers and page-two columns; synthetic Horizon topic IDs; and whether the image-only page is correctly flagged as needing OCR when OCR is disabled. The separate [BMF full-cell gold](bmf-dense-grid-recovery.md) covers all eleven pages. A successful parse with `NEEDS_OCR` is reported as format support plus unresolved content, not successful OCR. The 230-page Clean Hydrogen programme checks parse support and page count, not full text accuracy.

Baseline observations from the 20 hash-matched inputs: 20/20 formats parsed; DOCX source-text presence 5/5 at 1.0 and the inline formula sequence present; PPTX 28/28 source paragraphs in order and 6/6 slides; German press headings 2/2 in order, BMF first three pages' four tables 4/4 exact shapes, pension form IDs 5/5, scan `NEEDS_OCR` correctly signalled. The synthetic ledger's four zero-prefixed account-code occurrences are visible exactly. BMF XLSX raw numeric cell exact visibility is 1080/2979 because the parser presents formatted display values, including rounded and locale-formatted numbers; all 533/533 source string cells are visible. These figures should not be collapsed into a single quality percentage.

Remaining gold work: displayed-versus-stored Excel numerics, original cell address and type preservation, other-issuer heading negatives, and independent German/English OCR CER/WER. The scan in this corpus has OCR disabled by design; it cannot establish OCR accuracy. The runtime integration and `auto` routing remain governed by separate 02ontology validation.

## Evaluator provenance

This is evaluator revision 1. It replaces the original ad hoc comparison scripts with a portable source manifest and per-document JSON. The old scripts scored Office text globally, and the Excel cell script scored **strings only**; this evaluator adds slide order, source type categories, raw numeric diagnostics, structure, and OCR state. The original September comparison report and raw results remain in the evaluation artifact. Two examples show why scores must be read with their definitions:

| Document | September comparison | Current gate baseline | Interpretation |
| --- | ---: | ---: | --- |
| `test.pptx` | text recall 0.0 | 28/28 paragraphs in order, 6/6 slides | PPTX support was implemented after the old run. |
| `bmf-tax-tables.xlsx` | string-cell recall 1.0 | 533/533 source strings; 1080/2979 raw numerics exact | The new numeric denominator includes displayed values that are intentionally rounded or formatted. |
| `hgb-posting-lines.xlsx` | string-cell recall 0.991848 | 368/368 source strings; zero-prefixed codes 4/4 | Source-cell and output normalization changed, and parser code also changed. This is not a controlled causal improvement estimate. |

The baseline contains the SHA-256 of the manifest and all three evaluator modules. Future evaluator edits must present the previous and new scores alongside an explanation before recording a new baseline.

### BMF table-shape gold correction

The first manifest treated PDF page 3 as one 44×7 table. Visual inspection and the official workbook show two independent tables, **20×7 and 23×7**, with `Übersicht 4` between them. The parser repair separates them. Under the old manifest, this produced the misleading `de-tax-pdf tableShape` change **3/3 → 2/3** and made `--gate` fail. The corrected manifest checks four tables across pages 1–3, and the repaired parser scores **4/4**. The previous baseline JSON remains available at [the b357 archive](data/zero1-office-pdf-baseline-b357.json); the new baseline records implementation commit `13e89c2`. The evaluator modules, other nineteen document expectations, OCR option, and external ODL200 evaluator were unchanged. A fresh `--gate` run on the corrected manifest reported 20/20 supported and zero regressions.

The BMF result now carries `HIDDEN_TEXT_FILTERED` for 15 repeated header/footer items after the tables separate. The full BMF workbook gold still matches all 3,076 displayed cells, labels, and table boundaries; the warning is retained in the recorded result rather than suppressed.
