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
| `group-transform.pptx` | seven group labels preserved on both slides, no warnings |
| `table-merge-encoding.pptx` | all five source tables emitted with span attributes, no warnings |

## Independent PDF

The German federal government strategic-partnership PDF (14 pages) parsed
successfully. The title was initially emitted as H3; the generic header-table
lead fix in this branch now emits it as H1. The numbered section
`1. Partnerschaft für ein sichereres Europa` remains H2. Existing press-release
heading tests and the full Zero1 suite still pass after this change.

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

The merged-main OCR image was rebuilt with SHA-verified English and German
models and run with `--network none`.

| Scan | CER | WER | Critical anchors |
| --- | ---: | ---: | --- |
| German government page 1 | 5.06% | 6.74% | 5/5 |
| GitHub English policy page 1 | 0.38% | 1.36% | 5/5 |
| Lidl brochure pages 1–10 stress set | 55.86% mean | 69.34% mean | layout-dependent |

The first two are clean text-heavy scan holdouts and pass the anchor gate. The
Lidl set exposes a remaining difficult-layout OCR weakness: logo text,
multi-column promotional labels, and image-backed typography produce high
CER/WER despite preserving important product/price anchors. It remains a
stress failure and should not be used as evidence to promote OCR as a universal
default.

## WSL status

The saved WSL endpoint `onto@172.30.14.143` was retried during this holdout and
timed out on SSH port 22. The same merged-main tarball and SHA were verified in
local Docker Desktop with the network disabled. No WSL success is claimed until
that endpoint becomes reachable.
