# Zero1 Dedoc independent Office/PDF/scan holdout

Date: 2026-09-29. PR #5 merged parser commit:
`e6b26ea034676c9675c43e2a9473f47d6e455b3e`. The original measurements
started on implementation commit `47fc6d3`; its source files were unchanged
through PR head `269ad29` and the squash merge (only the manifest and docs
changed). Inputs and hashes are in
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
The later [six-document PPTX gate](pptx-holdout-and-surfaces.md) expands this check to notes, images, charts, and exact merged-cell grids.

## Independent PDF

The German federal government strategic-partnership PDF (14 pages) parsed
successfully. The title was initially emitted as H3; the first-page
header-table lead fix now emits it as H1. The numbered section
`1. Partnerschaft für ein sichereres Europa` remains H2. Existing press-release
heading tests and the full Zero1 suite still pass after this change.

PR #5 also made a middle-page compact table promote the following H2 section
to H1, and could promote a middle-page paragraph to H1. The follow-up fix
`ce11c6d` confines header-table title promotion to page 1, preserves H2, and
allows a first-page H3 document title to become H1. The real 14-page German
PDF still emits its first title as H1 and its page 5 section as H2.
The follow-up passed typecheck, build, the hash-pinned German tax/form smoke,
and the full suite (2,655 passed, 10 skipped, 0 failed on macOS).

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

### Full ODL200 heading regression check

The unmodified public evaluator at `7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109`
was rerun on all 200 fixed PDFs. PR #5 merge `e6b26ea` and the follow-up fix
`ce11c6d` both parsed **200/200**. Their 200 prediction Markdown files and
evaluator JSON were byte-for-byte identical. MHS was **0.932713617** over 107
scored documents; overall was **0.937073892**, NID **0.938037332** over 200,
and TEDS **0.935699400** over 42. Per-document MHS, NID, TEDS, and overall
delta counts were all **zero**. The complete 200-document evaluator output is
[`data/zero1-page-lead-guard-odl200.json`](data/zero1-page-lead-guard-odl200.json),
SHA-256 `4f51a16d22b3436e9329e2fbb06559090c0e78f6b5ec2bb14593205e8739c284`.

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

A direct-PNG route probe on 1.5× and 2× enlarged derivatives of the same
page scored 28/30 and 27/30 components. These are not independent samples and
do not replace the 30/30 image-only-PDF result; they show that this PDF-path
pass should not be generalized to direct image ingestion.

Candidate evidence: Zero1 commit
`eb3850b42e85b8950de84c7a964bf7e28e2dfba8`; package SHA-256
`e503bdb150b1c91c45055839c20898de1416c16c7b87fe843b468ad4b76242b6`; local
Docker manifest `sha256:83f303f1101137628cdd0a0341cedb33ad471257048e61d26ef96c97dd9591e6`;
all three final scan runs used `--network none`. Full Zero1 test suite: 2,651
passed, 10 skipped, 0 failed.

## WSL status

The saved SSH target `onto@172.30.14.143` timed out from the Mac host. That is
a stale, restart-sensitive WSL address, not evidence that WSL or Docker is
down: the operator reported working `wsl.exe` Docker access on the Windows
host. The specific candidate OCR image in this report was verified in local
Docker Desktop with `--network none`; a WSL run of that image has not been
recorded here.
