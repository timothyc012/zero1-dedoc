# Zero1 Dedoc independent Office/PDF/scan holdout

Date: 2026-09-29. Parser commit: `47fc6d3`. Inputs and hashes are in
[`bench/independent-holdout-manifest-2026-09-29.json`](../../bench/independent-holdout-manifest-2026-09-29.json).
These files were not part of the original 20-file development comparison.

## Office and PPTX

| Input | Result |
| --- | --- |
| CC0 `ffc.docx` | `docx`, exact text anchors preserved |
| CC0 `ffc.xlsx` | 39×4 source OOXML cells equal the emitted Markdown table, 156/156 cells |
| CC0 `ffc.pptx` | one-slide text order and both anchors preserved |
| `group-transform.pptx` | seven group labels preserved once per slide; rendered visual order matches on both slides |
| `table-merge-encoding.pptx` | all five source tables emitted with span attributes, no warnings |

For the group-transform visual-order check, LibreOffice rendered both slides
from the manifest-pinned fixture. On each slide, the visible label order was
`rot30` → `flipH` → `flipV` → `rot330-flipHV` → `scale-rot` →
`childrot-in-rot` → `nested-rot-in-scale`; the parser returned that order once
per slide with no warnings. This closes that fixture's visual-order assertion;
it is not a four-document PPTX layout corpus.

## Independent PDF

The German federal government strategic-partnership PDF (14 pages) parsed
successfully. The title was initially emitted as H3; the generic header-table
lead fix in this branch now emits it as H1. The numbered section
`1. Partnerschaft für ein sichereres Europa` remains H2. Existing press-release
heading tests and the full Zero1 suite still pass after this change.

### BMF XLSX-backed PDF cell gold

The public BMF PDF (`1bbaae…23c4b2`) was checked against its companion XLSX
(`36dd81…d7f64f80`) as an independent cell source. PDF pages 1 and 2 matched
all 47×7 and 50×7 table positions, including blanks; all eight and seven
visible projected merge spans also matched. The fixed German smoke additionally
passed selected exact totals and table-dimension checks on pages 1–3, 5–7, and
9–11.

The full 11-page cell gate is **not** complete. On the two split right-side
panels for each state table, numeric cell-token multiset recall was 73.8% and
54.1% for the August pages, and 74.2% and 54.1% for January–August. The
left-side panel values were 100%, 99.7%, 100%, and 100%. These token scores
measure content presence only; they do not certify row/column ownership or
merged-cell structure. The remaining right-side cells and all merges need a
page-mapped gold review before this gate can pass.

The Lidl brochure (73 pages) parsed successfully with 186 table blocks and
critical anchors including `Frischesieger`, `Eisbergsalat`,
`Deutschland/Spanien`, `0.77`, and `lidl.de/retail`. It is a deliberate layout
stress case; its many promotional labels are not treated as a heading gold
set.

Ten previously unused OpenDataLoader documents (`01030000000111`–`120`) were
rerun after the fix: 200/200 corpus parsing remained successful. The selected
documents averaged overall **0.95052**, NID **0.94630**, TEDS **0.98716** over
four table-scored documents, and MHS **0.90776** over five heading-scored
documents.

## Scan OCR

The OCR-enabled image was rebuilt with SHA-verified English and German models
and run with `--network none`. The candidate adds adaptive high-resolution
text detection, overlapping detector tiles, coarse/detail OCR passes,
line-aware pass selection, overlapping-text deduplication, and preference for
a complete decimal price over a partial digit crop.

| Scan | CER | WER | Critical anchors |
| --- | ---: | ---: | --- |
| German government page 1 | 5.06% | 6.74% | 5/5 |
| GitHub English policy page 1 | 0.38% | 1.36% | 5/5 |
| Lidl brochure pages 1–10 stress set | superseded | superseded | needs visual gold |

The first two are clean text-heavy scan holdouts and pass the anchor gate. A
visual audit found that the Lidl source's hidden text layer says 2025 on page 2,
while the rendered award artwork says 2026. The earlier 10-page CER/WER
averages used that hidden layer as gold. They are not safe to use as a
promotion gate until the mismatched visual gold is corrected, and they must
not be cited as a measured failure of this candidate.

### German advertisement visual holdout

The page 2 raster was converted to an image-only PDF so the parser could not
read the original text layer. Source, scan PDF, and raster hashes are in the
manifest. Against a 30-component checklist read from the rendered page, the
candidate preserved **30/30** critical components across the date/headline,
promotional claims, award logo, retailer, product card, offer, and price claim.
The product name, price, and key price-claim word each occurred once. The main
assortment claim remained in one OCR line; cross-scale duplicates were
removed.

This is a one-page visual-content gate for this flyer, not a CER/WER estimate
for a German advertising corpus. A few decorative glyphs remain, and the
layout parser represents some promotional panels as a table. Text anchors
pass; faithful graphic reconstruction is not claimed. OCR remains opt-in for
scanned PDFs.

The same candidate was rerun on the German-government and GitHub scan
holdouts. Their markdown outputs were byte-for-byte identical to the previous
holdout results; those scans do not trigger the large-page adaptive path.

Candidate evidence: Zero1 commit
`eb3850b42e85b8950de84c7a964bf7e28e2dfba8`; package SHA-256
`e503bdb150b1c91c45055839c20898de1416c16c7b87fe843b468ad4b76242b6`; local
Docker manifest `sha256:83f303f1101137628cdd0a0341cedb33ad471257048e61d26ef96c97dd9591e6`;
all three final scan runs used `--network none`. Full Zero1 test suite: 2,651
passed, 10 skipped, 0 failed.

## WSL status

The saved WSL endpoint `onto@172.30.14.143` was retried again from the final
candidate run and timed out on SSH port 22. OCR verification used local Docker
Desktop with `--network none`; no WSL success is claimed until that endpoint is
reachable.
