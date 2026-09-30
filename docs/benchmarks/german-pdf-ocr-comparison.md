# German PDF OCR comparison, 2026-09-30

On the fresh 20-document XFUND German form test, Zero1 had lower field-region
character and word error than Docling 2.131.0 and RapidOCR 3.9.2, including a
same-capacity RapidOCR medium comparison. This is a result on the frozen test
set, not a ranking of all German documents.

Zero1's German OCR profile now uses SHA-pinned PP-OCRv6 medium detection and
recognition models, the alphabet embedded in the recognizer, and minimum-area
oriented rectangles with affine line crops. A single detailed detector pass
keeps neighboring invoice lines separate. Korean and English keep their
existing PP-OCRv5 models and processing. Model preparation for German now needs
two files in `ppocr/de-v6`, about 139 MB total; prepare that cache before offline
parsing. This is a substantial model-size increase over the old Latin profile.

## Fixed corpus and measurement

The [Belege manifest](../../bench/german-pdf-competition-manifest.json) freezes
40 distinct public [Belege sample](https://huggingface.co/datasets/laterrr/belege-de-invoices-sample)
invoice images, label hashes, and deterministic image-only PDF hashes. Twenty
previously evaluated documents were development inputs. The other twenty
instances were frozen before candidate changes, then examined during this work;
they are a validation set, not a blind test of the final correctness fixes.
All 40 are from one synthetic invoice generator.

A different [XFUND German form manifest](../../bench/german-xfund-pdf-manifest.json)
contains the lexicographically first 20 validation documents from the public
[XFUND v1.0 release](https://github.com/doc-analysis/XFUND/releases/tag/v1.0).
Images, labels, selected numeric-answer entity IDs, and deterministic PDFs were
fixed before any OCR on this document family. No document was excluded and no
candidate setting was chosen from its scores or predictions. This is the fresh
family test of the final candidate. Vendor model-training overlap with XFUND
is unknown. Original images, labels, and parser text remain ignored local files.

Each PDF embeds its source image at 144 dpi. All measured PDF OCR runs render
at 216 dpi. Zero1 measurements capture lines from its actual PDF parsing path,
including its deskew and model profile, and invert deskew/scale coordinates back
to the original labels. Docling measurements use its retained parsed-page OCR
cells; visible plain structured text, including list markers, is scored
separately for selected values. Standalone
RapidOCR receives a PIL raster, so its own RGB-to-BGR conversion is used.

The same unchanged [field scorer](../../bench/lib/ocr-field-metrics.mjs) assigns
recognized lines to labeled fields using geometry alone and then computes
normalized character/word edit distance. These **field-region CER/WER** include
missed text, field association, and boundary errors; they are not isolated
recognizer accuracy or whole-page transcription scores. Reading visible field
labels together with values can create insertions against value-only reference
fields. Unannotated text is excluded. Important-value checks search final parser
output for exact normalized invoice number, gross total, tax ID, and applicable
tax note. XFUND probes are the first two numeric answer entities per document,
selected before OCR, rather than a hand-ranked set of business-critical fields.
These checks do not prove that a value is attached to the right field.

Compared versions/settings:

- Previous Zero1: source `140d040b2b25047930b3144f4732f4e8bb28d8bf`, German
  PP-OCRv5 mobile/Latin, real PDF path with deskew.
- New Zero1: German PP-OCRv6 **medium**, ONNX CPU with four threads, oriented
  crops; `ocr=true`, `ocrLanguage=de`, `images=false`.
- Docling **2.131.0** with RapidOCR **3.9.2**, `lang=['de']`, full-page OCR for
  these image-only PDFs, table processing enabled, four CPU threads. Its normal
  model resolver chooses PP-OCRv6 **small**.
- Standalone RapidOCR **3.9.2**, German language selection, PP-OCRv6 **small**
  and its normal preprocessing/classifier, four CPU threads. A same-capacity
  medium probe is recorded separately. This is not an equal-model comparison
  when comparing Zero1 medium to the small presets.

## Results

### Fresh XFUND German forms, 20 documents

| Parser | Field CER | Field WER | Selected answers present |
| --- | ---: | ---: | ---: |
| Previous Zero1 | 5.92% | 14.14% | 35/39 |
| New Zero1 | **3.77%** | **11.66%** | **35/39** |
| RapidOCR small | 8.85% | 17.54% | **35/39** |
| RapidOCR medium (same model capacity) | 7.34% | 15.28% | 34/39 |
| Docling / RapidOCR small | 7.46% | 16.07% | **35/39** |

The corpus contains 34,416 labeled reference characters and 4,555 words.
Zero1's CER was lower on 12 documents and tied on six compared with RapidOCR
medium; it was lower on 14 and tied on two compared with Docling. A paired
10,000-replicate document bootstrap gives CER improvement intervals of
1.29–5.98 percentage points over RapidOCR medium and 1.04–7.30 points over
Docling (95%, seed 30092026). These intervals describe this selected corpus.
Four selected answers are still absent from Zero1's final output.

### Belege development plus validation, 40 invoices

This aggregate includes tuning documents and is not an independent test.

| Parser | Field CER | Field WER | Selected values present |
| --- | ---: | ---: | ---: |
| Previous Zero1 | 23.62% | 39.79% | 107/123 |
| New Zero1 | **16.59%** | 29.51% | **117/123** |
| RapidOCR small | 17.01% | 30.61% | 114/123 |
| RapidOCR medium | 17.05% | **29.41%** | **117/123** |
| Docling / RapidOCR small | 16.68% | 31.19% | 91/123 |

The small CER difference between Zero1 and Docling is not a general
superiority claim. RapidOCR medium has slightly lower WER on these invoices,
and the initially unused 20-instance validation split also has a slightly
lower competitor CER. The larger improvement is against the previous Zero1
implementation. Timings were collected during other local measurements and do
not establish a throughput ranking. The medium models increase cache/CPU cost.

The [machine-readable scores](data/german-pdf-ocr-comparison.json) contain
all per-document counts, split membership, model/input hashes, the Python
runtime versions, and resolved Docling model revisions. The earlier 30.31%
German figure measured a raw-image engine/field route without the actual
parser's deskew. It is not the before number for this PDF comparison.

## Regression evidence and limits

The complete test suite passed 2,720 tests with 10 existing skips. Typecheck and
build passed. The public ODL200 prediction set parsed 200/200, and every
Markdown file and re-evaluated document score was unchanged; the fixed evaluator
and ground-truth repository is at `7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109`.
The [ODL receipt](data/german-ocr-odl-regression.json) records before/after
reading-order, table, and heading scores for all 200 documents. The overall
score is 0.937073892 and MHS is 0.932713617. These are regression scores, not a
new current-Docling comparison on ODL200.

The official hash-pinned BMF PDF still passes all eleven page/cell/merge gates,
including 3,076 aligned displayed values; the pension form retains all five
form IDs once. Current Docling also retained all 3,076 displayed BMF numbers,
but its table shapes and merge representation differ from the literal workbook
gold. That distinction must not be described as lost numbers. The German and
English image-only/mixed PDF offline-model smoke passed 4/4. Korean unit tests
passed; the unavailable private Korean raster corpus remains unverified.

The previous one-page Lidl advertising raster was also rerun. Date, product,
price, retailer, and main claims remain, but the decorative award/year region
still has OCR errors and the new multilingual recognizer can emit a spurious
non-Latin decorative glyph. A one-page probe does not establish broad German
advertising quality. Neither this change nor the invoice corpus grants scan
`auto` promotion in 02ontology.

## Reproduce

```sh
python -m pip install -r bench/german-ocr-python-lock.txt
python bench/fetch-german-pdf-corpus.py
python bench/build-german-pdf-corpus.py
python bench/fetch-xfund-pdf-corpus.py
npm ci && npm run build
export KORDOC_MODEL_CACHE="$(pwd)/bench/corpus/models"
node dist/cli.js check-ocr-models --language de
KORDOC_OFFLINE=1 node --import tsx bench/german-pdf-zero1.mjs \
  --split holdout --manifest bench/german-xfund-pdf-manifest.json \
  --out bench/out/zero1-holdout.json
python bench/german-pdf-competitors.py --parser rapidocr \
  --split holdout --manifest bench/german-xfund-pdf-manifest.json \
  --capacity medium --out bench/out/rapidocr-holdout.json
python bench/german-pdf-competitors.py --parser docling \
  --split holdout --manifest bench/german-xfund-pdf-manifest.json \
  --out bench/out/docling-holdout.json
node bench/german-pdf-score.mjs --manifest bench/german-xfund-pdf-manifest.json \
  bench/out/zero1-holdout.json \
  bench/out/rapidocr-holdout.json bench/out/docling-holdout.json
```

Prepare competitor models before an offline repeat. PDF rebuilding checks the
frozen hashes instead of regenerating gold. Dataset source revision is fixed
in the manifests. The Docling layout model revision is pinned in the runner;
its table-model artifact revisions/hashes are recorded in the receipt. Model URLs and checksums come from the
[RapidOCR 3.9.2 registry](https://github.com/RapidAI/RapidOCR/blob/v3.9.2/python/rapidocr/default_models.yaml);
the independent Node implementation reads ONNX `ModelProto.metadata_props`
and uses the model's embedded alphabet rather than a mismatched dictionary.
Model weights are not redistributed in the npm tarball. Preserve the source
dataset terms and the PaddleOCR Apache-2.0 attribution in `NOTICE`.
