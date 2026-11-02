# Upstream and fork boundary

Zero1 Dedoc is a GitHub fork of [chrisryugj/kordoc](https://github.com/chrisryugj/kordoc), starting from commit `878b7009a97a1e7d0f37e304ad2046b6d7916818` (v4.16.1, 2026-09-29). The full commit history is retained. Kordoc's MIT license, original copyright notice, and the attributions in `NOTICE` and `THIRD_PARTY/` remain part of this fork.

The first Zero1 Dedoc changes are:

- A page-counter-aware PDF header classifier that keeps numbered form titles while removing genuine printed page numbers.
- Geometry-based arbitration that lets a complete ruled table take precedence over coarser overlapping text clips.
- A cross-page table boundary for a new document title printed inside the next ruled table.
- A separate `zero1-dedoc` npm/CLI/MCP identity that can coexist with Kordoc's binaries.

The API and intermediate representation are otherwise inherited. The `plugins/kordoc` directory and `.claude-plugin` marketplace remain **upstream snapshots**. They are not a Zero1 Dedoc plugin release; their Kordoc names and upstream links are intentionally retained until that distribution surface is separately adapted and verified.

Upstream updates should be fetched from the `upstream` Git remote and reviewed as normal code changes. Never overwrite the fork's quality gates with new upstream benchmark scores. Re-run the fixed German inputs, the public 200-document benchmark, and the Korean regression suite after each merge. Record the exact input and source commits for comparisons.

## Fetched reference: 2026-09-29

Upstream v4.16.3 (`bb71f7fb0bf51dd456d27505a8c04772df182144`) has been fetched and checked out in a separate reference clone. The generation-image access fix (`1a70bc1`) and superscript/subscript plus PDF author-line support (`cc1fca2`) are now incorporated into Zero1 Dedoc with `git cherry-pick -x`; release metadata and Kordoc package identity were kept out of the fork. The [Office/PDF improvement plan](plans/2026-09-29-office-pdf-improvements.md) records the exact commits, source references, conflict boundaries, and validation gates. The current user-requested corpus scope is Office, PDF, and German/English scans; it excludes dedicated HWP corpus evaluation.

## Full merge: upstream v4.24.38 (2026-11-02)

Branch `claude/upstream-sync-v4.24.38` merges `upstream/main` `d4050eac` (v4.24.38) into the fork with a normal merge commit, so the merge base moves forward and later syncs only see newer upstream commits. Earlier syncs (#21, #23) were selective ports and left the merge base at v4.16.1; by this point the fork was 1,057 upstream commits behind and a trial merge showed 58 conflicting files. The fork does not send changes back upstream.

Conflict policy: when a fork change was itself a port of upstream (v4.16.3 script tags, image-path confinement, page-boundary paragraphs, CLI parts of #23), the current upstream code wins. Genuine fork features are re-applied on top of upstream's code.

Kept from the fork:

- `ocrLanguage` (`korean`·`en`·`de`, aliases accepted). It selects a model set in `src/ocr/models.ts` (`languageModels`); explicit `ocrDet`/`ocrRec`/`ocrRecDict` override it. The models stay in the same cache folders (`ppocr/en`, `ppocr/de-v6`).
- The German PP-OCRv6 path as a separate engine, `src/ocr/engine-v6.ts` (`GermanOcrEngine`): oriented detector boxes, affine crops, the alphabet embedded in the rec model, CTC prefix beam, GPU-first execution with CPU fallback, and the CPU thread budget. `src/ocr/engine.ts` keeps upstream's code and only dispatches generation-6 selections there, which keeps future conflicts in `engine.ts` small. Measured before this merge: running the same v6 models through upstream's local-model options read 0 of 6 dense receipt item lines, against 5 of 6 on the fork path.
- PDF-point OCR lines for text-layer consumers. Upstream's `ParseSuccess.ocrLines` (per-page raster boxes) is the public shape now. The PDF parser adds each page's `view` and `rotate`, and `ocrLinesInPdfSpace()` converts the result into the fork's `PdfOcrLine` contract: unrotated user space, bottom-left origin, with `angle` (`tests/zero1-ocr-pdf-space.test.ts`). Zero1 PDF and scan2pdf call this helper instead of reading `ocrLines` directly.
- A full-page OCR that reads nothing is reported as `OCR_FAILED` and does not replace the page text.
- Identity (`zero1-dedoc` name, CLI name, MCP setup without an npx fallback), `--ocr-language`, the worker's OCR-off default, Windows drive-letter image paths, XLS/XLSX `includeCellProvenance`, and the PPTX group reading order, notes boxes and picture warnings (on top of upstream's PPTX parser).

Dropped in favour of upstream, by decision:

- The CLI lazy-load split and its startup-boundary tests (`tests/cli-startup-boundaries.test.ts` and its fixtures). `src/parse.ts` is now a re-export shim of `index.ts`; upstream rebuilt the CLI around batch workers that import `index.ts`.
- Detection tiling and multi-pass merging for the Korean/English engine (`detection-tiles.ts`). German pages use the v6 path.
- The fork's cooperative OCR cancellation and late-result draining in `pdf-ocr.ts` (`tests/pdf-ocr-lifecycle.test.ts`). Upstream's loop already closes PDFium in `finally` and only records lines from pages that finished.
- The fork's model download single-flight and its test (`tests/model-preparation-concurrency.test.ts`, which hung against the new implementation). Upstream added its own concurrent-download protection, covered by `tests/model-concurrent-download.test.ts` and `tests/model-download-cleanup.test.ts`.
