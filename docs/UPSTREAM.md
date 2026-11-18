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

## Full merge: upstream v4.24.63 (2026-11-11)

Branch `codex/upstream-4-24-63` merges `upstream/main` `a71bdba` (v4.24.63) into the fork as a normal merge commit; the merge base moves from `d4050eac` (v4.24.38). 165 upstream commits landed, including the OCR page-orientation detection (`pageRotation`), the Rust `xml-flat` XML reader replacing `@xmldom/xmldom`, the gVisor sandbox worker (`KORDOC_SANDBOX=gvisor`), QR-code reading (`zxing-wasm`), HTML cell links, and Office hardening fixes.

Conflict policy was unchanged: upstream code wins where it supersedes a fork port; fork features are re-applied on top. 12 files conflicted (`CHANGELOG.md`, `README.md`, `package*.json`, `src/ocr/{crop,engine,models,pdf-ocr}.ts`, `src/pdf/page-blocks.ts`, `src/pptx/parser.ts`, `src/xlsx/{parser,sheet-blocks}.ts`).

Kept from the fork:

- `ocrLanguage` routing including German (`de`), the generation-6 dispatch in `src/ocr/engine.ts`, and `src/ocr/engine-v6.ts` untouched.
- `ocrLinesInPdfSpace()` and `PdfOcrLine`; it now also undoes upstream's quarter-turn `pageRotation` before mapping to PDF space.
- `includeCellProvenance` (XLS/XLSX), PPTX group reading order, notes boxes and picture warnings, `--ocr-language`, the worker's OCR-off default, and the `zero1-dedoc` identity. `server.json` keeps the upstream registry name by convention and follows the upstream version.

Post-merge review fixes on top of the conflict resolution:

- Full-page OCR on quarter-turned rasters (PDF and image inputs) returned blocks in the corrected raster's coordinates while `ocrLines` reported original-frame lines; `restoreOcrPageOrientation()` now maps block, nested-block, caption, footnote and table-cell boxes back to the original orientation, preserving reading order.
- `ocrLinesInPdfSpace()` undid the quarter turn with pixel-index math (`W−1−y`), off by one raster pixel; it now uses continuous box-edge transforms.

## Full merge: upstream v4.25.0 (2026-11-18)

Branch `claude/zeroon-office-connection-ec6ef8` merges `upstream/main` `6fa11788` (v4.25.0) into the fork as a normal merge commit; the merge base moves from `a71bdba9` (v4.24.63). 128 upstream commits landed. The largest change is the PDF text-layer engine: pdf.js (`pdfjs-dist`) is replaced at runtime by hayro compiled to wasm (`src/pdf/hayro-pdf.wasm`, committed, so `npm ci && npm run build` needs no Rust toolchain). OCR and formula rasters still use PDFium. Other additions: HWP 5.0 save (`generate -o x.hwp`), PDF layout measuring for report generation (`measure`, `generate --layout`), image normalisation for LLM APIs, more image input formats, and Hancom automation hardening.

15 files conflicted (`CHANGELOG.md`, `README.md`, `package*.json`, `scripts/sync-meta.mjs`, `src/cli.ts`, `src/mcp.ts`, `src/mcp/{shared,tools-parse}.ts`, `src/ocr/image-ocr.ts`, `src/pdf/{cell-extract,parser,table-grid}.ts`, `src/shared/generate-images.ts`, `tests/pdf-nonhancom.test.ts`). The policy was unchanged.

Kept from the fork:

- Identity: package name and bins, CLI and MCP descriptions, PPTX in the MCP parse extensions, and `sync-meta` without MCP registry or plugin version sync (no `mcpName`). The inherited `plugins/kordoc` snapshot now reads v4.25.0.
- PDF page frames for `ocrLinesInPdfSpace()`: the parser now takes `view` and `rotate` from hayro (`doc.pageView`, `doc.pageRotate`) instead of the pdf.js page.
- The caption-in-gap split (`gapText`) in `mergeAdjacentGrids`, combined with upstream's new 10pt limit for two closed boxes (`CLOSED_BOX_GAP`). `tests/pdf-table-gap-caption.test.ts` now uses an 8pt gap so the caption rule is still exercised.
- `imageOcrItemsToBlocks()` with the quarter-turn restore, now taking upstream's page number.

Measured on the merge (Node 26.12.0, macOS arm64):

- `npm run typecheck` passes; `npm test`: 5,366 tests, 5,337 pass, 25 skipped, 3 failures fixed after the merge (two test expectations above and a doubled `file:` URL in `tests/stdout-channel.test.ts`), then the three files pass.
- Zero1 Office's bundled OCR bridge (`zero1-dedoc-ocr.mjs`, German) on three local scans: `ocrLines` JSON and Markdown identical before and after.
- 25 local text-layer PDFs: 16 identical, 9 changed; 7 of the changes match pure upstream v4.25.0 exactly (number spacing, escaped `---` lines, form field values). One guidebook PDF loses 17 bullet-list "tables" (upstream also gives 0). The remaining differences from pure upstream are fork heading and header rules.
- CLI convert (docx, xlsx), `generate` to HWPX and re-parse, and the MCP server (22 tools, `initialize` reports `zero1-dedoc` 4.25.0-zero1.1) work.

Not run: the public ODL 200-document benchmark and `bench:german-smoke` (inputs are not on this machine), and the private Korean corpus gate (`bench/corpus` absent).

Known consequence: Zero1 PDF's `scripts/build-pdf-table-parser.sh` requires `node_modules/pdfjs-dist` assets and imports `PDFJS_DOCUMENT_OPTIONS`, neither of which exists after this merge. The already-built, hash-pinned table parser bundled in the app keeps working; rebuilding it needs a separate update of that script.
