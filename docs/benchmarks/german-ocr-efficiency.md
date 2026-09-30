# German OCR: further accuracy and CPU improvement

Date: 2026-09-30. Baseline source `335f2850bf7e674624e76e7aa4b19606553264dc`; candidate runtime source `988fcb4e84a04a169c04c5137f360e126eabf615`. This extends the [previous comparison](german-pdf-ocr-comparison.md). [Machine-readable evidence](data/german-ocr-efficiency.json) contains per-document edit counts, input/output hashes, paired bootstrap intervals and ODL200 before/after scores.

## Same documents, before and after

CER/WER are micro-averaged **field-region** errors from the unchanged geometry-only evaluator. They include missed regions, merged fields and reading-order errors; they are not isolated character-recognizer accuracy.

| Fixed corpus | Documents | CER before → after | WER before → after | Selected answers before → after |
| --- | ---: | ---: | ---: | ---: |
| XFUND development, previously evaluated | 20 | 3.7657% → 3.7279% | 11.6575% → 11.5038% | 35/39 → 35/39 |
| Belege, development + seen validation | 40 | 16.5920% → 16.1017% | 29.5050% → 28.3998% | 117/123 → 118/123 |
| Additional XFUND validation, frozen before candidate inference | 30 | 3.2477% → 3.2277% | 11.3602% → 11.2095% | 49/53 → 49/53 |

The fresh 30 are all German validation IDs excluded from the prior first 20, sorted lexicographically. No document exclusions or gold edits were made. Selection and SHA-pinned image/label/PDF hashes are in [the manifest](../../bench/german-xfund-efficiency-manifest.json). Vendor model training overlap with XFUND is unknown. Some forms in this German release contain English text.

The incremental gain is small: fresh-30 per-document CER improves on eight documents, ties on 21 and worsens on one. The paired 10,000-resample CER reduction interval is **0.0000–0.0381 percentage points**; the development-20 interval crosses zero. This does not establish a new universal accuracy ceiling. Belege's interval is 0.0554–1.0432 points, but these documents have been seen during tuning.

### Current competitors on the same fresh 30

| Parser/settings | CER | WER | Selected answers |
| --- | ---: | ---: | ---: |
| Zero1 candidate, medium models | 3.2277% | 11.2095% | 49/53 |
| RapidOCR 3.9.2, same-capacity medium models | 7.9310% | 15.6368% | 50/53 |
| Docling 2.131.0 + RapidOCR, default small models | 5.2865% | 14.2050% | 49/53 |

Zero1 has lower aggregate CER/WER here; RapidOCR retains one additional selected answer. This is a result for this public form corpus, not a ranking of all German documents or advertising pages. Selected answers are mechanically chosen numeric answer entities, not an independently ranked business-critical set. Competitor versions, model hashes, rendering and plain-text export follow the previous comparison. No local speed comparison is claimed: exploratory jobs overlapped.

## Implementation

- German PP-OCRv6 uses prefix beam search with five prefixes and at most five token candidates per step. It sums CTC blank/repeat alignments without a lexicon, language model, gold text or field-specific replacement rules. [CTC inference reference](https://distill.pub/2017/ctc/#inference).
- When the chosen text equals greedy decoding, its established confidence/alignment are retained exactly. Changed text uses a Viterbi trace for confidence and character steps. Viterbi scores use log probabilities to retain alignment on long uncertain inputs. Tests independently enumerate short CTC sequences and cover repetition, Unicode, all-blank output and long-line underflow.
- German rectangle expansion changes from 1.6 to 1.4. Both medium model files, hashes and alphabet remain unchanged. English/Korean retain their decoder and crop policy.
- `ZERO1_OCR_THREADS` optionally sets a native CPU budget from 1 to 64, capped by `availableParallelism()`. German defaults to four, capped by available CPUs. Without an override, other languages retain their upstream thread policy. Set the variable before starting the process; cached engines keep their initialization settings.

## WSL CPU measurements

Host: Intel i9-8950HK, 12 logical CPUs; Docker 29.8.1, amd64, about 23.34 GiB available memory. Node 20.20.2, ONNX Runtime Node 1.30.0; network disabled. The **installed final package** at source `988fcb4` passed **6/6** sequential worker requests, including German/English scans, two forms and both official native PDFs. [Worker receipt](data/german-ocr-efficiency-wsl-worker.json), package SHA `737c9495b4f55108e6f9b59e9343ff349ee7560ec18ed51d19aaa8d5996bc580`.

The baseline is the previous six-request worker receipt; the final evaluation image reuses its model/runtime layer and replaces only the verified package plus the explicit eight-thread budget. Input hashes, model hashes and request order match. Baseline German uses four threads. These observations were taken at different times on the same host; they are not randomized latency estimates.

| Same German PDF | Prior worker | Final worker, eight threads | Reduction |
| --- | ---: | ---: | ---: |
| Image-only smoke | 52.42 s | 36.13 s | 31.1% |
| XFUND `de_val_0` | 112.50 s | 85.49 s | 24.0% |
| XFUND `de_val_1` | 70.46 s | 56.34 s | 20.0% |

This is one observation for three pages, not p95 latency or a general throughput promise. The English scan remains correct but takes 2.97 seconds versus 2.54 before; the explicit thread budget applies to every OCR language. The dense German form still exceeds a caller's 60-second deadline. Keep the operational parser/default routing unchanged until deployment gates are satisfied.

Separate exploratory source-bundled parse profiles at `0d8346e` measured 60.04→38.63 and 124.93→101.56 seconds. They initialize models before timing and are preserved as diagnostic evidence, separately from the installed final worker. The later log-probability fix retains identical raw OCR outcomes on all 90 evaluated PDFs.

Stage profiling identified native inference as the bottleneck: baseline `de_val_0` spent 19.55 seconds in detection and 98.39 seconds in recognition. Increasing the thread budget to eight helped this WSL host. Batch-six and ONNX Runtime 1.29 were weaker improvements; a single thread exceeded the page timeout. Smaller recognition weights and reduced padding worsened accuracy and were not promoted. INT8 MatMul preserved development accuracy but lacks fresh-corpus and distribution validation, so it is not shipped.

The old single-thread second record was **invalid**: OCR continued after a timeout and contaminated mutable counters for the next PDF. It is excluded. The committed profile harness exits immediately after OCR failure. An eight-thread Mac run during concurrent evaluation was killed with exit 137 after one PDF; its partial result is excluded. The complete fresh-30 accuracy rerun uses the default four threads. Eight threads is a measured WSL option, not a global default.

## Regression gates

- Full suite: **2,733 passed, 5 skips, zero failures** (2,738 total); typecheck/build passed. One additional parallel-suite attempt aborted in the native PDF resource dependency with a `recursive_mutex` exception. Its isolated resource rerun passed 17/17 and the final full-suite rerun passed; no test was disabled. The native abort cause was not established.
- ODL200: **200/200** parsed, all 200 Markdown files and every evaluator score identical. Overall 0.9370738921; NID 0.9380373321, TEDS 0.9356993999, MHS 0.9327136172. Evaluator revision remains `7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109`.
- Official German smoke: BMF all 11 pages/3,076 displayed values and five complete-document form identifiers retained.
- English/German image-only and mixed-PDF offline smoke: **4/4**.
- Relevant Korean unit tests pass; the private Korean raster corpus remains unavailable and its gate is unverified. HWP is outside this quality evaluation.

A spot check of the existing Lidl page retains `Eisbergsalat` and `0.77`, but the false `大` glyph remains. This is not a complete advertising pass.

The installed WSL worker retains all six smoke gates and the source/package hashes. Neither `02ontology`'s operating image pins nor its `auto` routing are changed by this evaluation.

## Reproduce

Use the pinned Python environment in `bench/german-ocr-python-lock.txt` (ReportLab 4.4.10) and the SHA-verified models from the previous comparison.

```sh
python bench/fetch-xfund-pdf-corpus.py --manifest bench/german-xfund-efficiency-manifest.json
KORDOC_OFFLINE=1 node --import tsx bench/german-pdf-zero1.mjs \
  --manifest bench/german-xfund-efficiency-manifest.json --split all --limit 30 \
  --out bench/out/efficiency-fresh-candidate4.json
node bench/german-pdf-score.mjs --manifest bench/german-xfund-efficiency-manifest.json \
  bench/out/efficiency-fresh-candidate4.json
ZERO1_OCR_THREADS=8 KORDOC_OFFLINE=1 node --import tsx bench/german-ocr-profile.mjs \
  bench/corpus/ocr-pdf-smoke/de-image-only.pdf bench/corpus/german-pdf-xfund/de_val_0.pdf \
  --out bench/out/profile.json
```

For four-thread baseline quality, run the same fixed manifest at source `335f285`. For competitors, use `bench/german-pdf-competitors.py` with this manifest and the pinned environment/settings above. Input images, labels and raw predictions remain ignored; committed receipts contain hashes and numeric metrics.
