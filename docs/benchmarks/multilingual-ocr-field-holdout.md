# German and English scanned-field OCR holdout

This is the historical PP-OCRv5 English/Latin measurement from Zero1 revision
`b397821f48494b65ad36a204eb03f30f126536df`. The German default profile was
subsequently improved; see the [German PDF comparison](german-pdf-ocr-comparison.md)
for the actual PDF pipeline, current models, and fresh German form evaluation.

The OCR corpus is frozen in [`bench/ocr-holdout-manifest.json`](../../bench/ocr-holdout-manifest.json). It contains **20 distinct one-page documents per language**: German [Belege (Immineal, 2026) free-sample](https://huggingface.co/datasets/laterrr/belege-de-invoices-sample) invoice images with generated field boxes, and 20 lexically preselected pages from the original [FUNSD testing split](https://github.com/crcresearch/FUNSD) with entity text boxes. Selection, image/label SHA-256 values, Belege revision, and FUNSD archive SHA-256 were fixed before the full OCR run. Belege contributes 10 scan variants, nine photos and one clean render. The English forms are noisy 100-dpi historical scans. These are different document families, so their error rates are **not** a language ranking. Original images and labels remain in ignored local `bench/corpus/`, not in Git.

## Measurement contract

[`bench/ocr-field-holdout.mjs`](../../bench/ocr-field-holdout.mjs) requires SHA-verified `de`/`en` OCR models already in the cache and can run with `KORDOC_OFFLINE=1`. The detector/recognizer returns pixel boxes and text. Each OCR line is assigned to the labeled field with the largest **geometric overlap divided by the OCR-line area**, provided that value is at least 0.1; a small field-coverage term breaks ties. The assignment never reads the gold text. Within each field, NFKC/lowercase/whitespace-normalized reference and prediction are compared using character and word edit distance. Corpus CER and WER divide total edit errors by total labeled reference characters and words; insertions can make a rate exceed 100%. Unannotated text is excluded. This measures **recognition plus field-region segmentation**, not isolated model-character accuracy or complete page transcription. Full Zero1 image parsing is run separately to check whether exact labeled identifiers/amounts appear in the final Markdown.

| Result | German Belege | English FUNSD |
| --- | ---: | ---: |
| Distinct documents / image pages | 20 / 20 | 20 / 20 |
| Labeled regions / matched regions | 597 / 549 | 792 / 715 |
| Field-region CER | **30.31%** | **31.85%** |
| Field-region WER | **49.51%** | **50.55%** |
| Full-parser success | 20 / 20 | 20 / 20 |
| Exact preselected value anchors in parser output | 52 / 61 | 34 / 48 |

Within Belege, scan variants measured **22.80% CER / 39.20% WER** (critical values 29/30); photos measured **37.90% / 61.22%** (20/28). The single clean image was 24.10% / 24.39%, too small to characterize clean invoices. German anchor gold includes invoice numbers, gross amounts, tax IDs and applicable tax notes. English anchor IDs were selected mechanically from numeric answer entities before OCR, so they are a value-recall probe rather than a hand-ranked set of business-critical fields. `OCR_LOW_CONF` appeared on six German and nineteen English images; it did not flag every high-error German photo. The [machine-readable baseline](../../bench/ocr-field-holdout-baseline.json) contains each document's counts and model SHA values. Raw image/label text and per-field predictions are written only to ignored local details output.

The error rates are substantial. This corpus closes the **measurement and provenance requirement**, but Zero1 is **not quality-approved** as a default scan backend from these results. The earlier clean German-government and English-GitHub page CER reports used whole-page text and different documents; their percentages cannot be averaged with these field-region scores. The separate [Lidl advertising visual check](zero1-independent-holdout-2026-09-29.md) remains a one-page 30-component result, not a broad ad OCR CER estimate. For important scanned content, keep the existing Docling/RapidOCR or dual-review path while OCR quality is investigated.

## Image-only and mixed PDF route

[`bench/build-ocr-pdf-smoke.py`](../../bench/build-ocr-pdf-smoke.py) deterministically wraps one pinned image from each language in an image-only PDF and a two-page PDF whose first page has native selectable text. The four output hashes are in [`bench/ocr-pdf-smoke-manifest.json`](../../bench/ocr-pdf-smoke-manifest.json). With cached models and offline mode, [`bench/ocr-pdf-smoke.mjs`](../../bench/ocr-pdf-smoke.mjs) passed **4/4**: the image page was OCRed, the mixed PDF's native first page stayed native, no `OCR_FAILED` occurred, and fixed invoice/English text anchors remained. The [PDF smoke receipt](../../bench/ocr-pdf-smoke-baseline.json) records the warnings. The same four PDF routes were subsequently verified in an offline WSL Docker amd64 candidate image, alongside BMF and pension-form PDFs (6/6); the [02ontology WSL receipt](https://github.com/timothyc012/02ontology/blob/main/docs/verification/zero1-candidate-wsl-2026-09-30.json) records source, package, image, model, and input hashes. This route smoke does not change the failed field-region OCR quality promotion decision above.

## Reproduce

The commands below run this corpus with the checked-out parser. Use a separate
checkout of the revision above to reproduce the historical table; running the
current German PP-OCRv6 profile is a new measurement, not that baseline.

```sh
npm ci && npm run build
npm run bench:ocr-fetch
export KORDOC_MODEL_CACHE="$(pwd)/bench/corpus/models"
node dist/cli.js check-ocr-models --language de
node dist/cli.js check-ocr-models --language en
KORDOC_OFFLINE=1 npm run bench:ocr-field-holdout
python3 bench/build-ocr-pdf-smoke.py
KORDOC_OFFLINE=1 npm run bench:ocr-pdf-smoke
```

The fetch command rechecks hashes before use. Model preparation is the only model-download step; the measured runs require verified cached models and can run without a network connection. `bench:ocr-field-holdout` writes an ignored aggregate report and a separate ignored field-detail file unless `--out` is given. Belege source terms allow evaluation and publishing derived results with attribution; the free sample and FUNSD inputs should be obtained from their linked sources under their respective terms. Neither dataset's images or labels are copied into this repository.
The PDF builder requires Pillow and ReportLab in the chosen Python runtime.
