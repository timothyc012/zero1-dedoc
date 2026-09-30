# Zero1 Dedoc

Zero1 Dedoc is a fork of [Kordoc](https://github.com/chrisryugj/kordoc) focused on reliable German and English **text-layer PDF** extraction while retaining Kordoc's Korean HWP/HWPX, Office, document generation, CLI, and MCP capabilities. It converts documents to Markdown and structured `IRBlock[]` data. The original history, MIT license, and [third-party notices](NOTICE) remain in this repository.

**Status:** Source preview. The `zero1-dedoc` npm package has not been published. The inherited Claude plugin under `plugins/kordoc` still refers to upstream Kordoc and is not a Zero1 Dedoc distribution channel.

## Run from source

Requires Node.js 20 or newer.

```sh
git clone https://github.com/timothyc012/zero1-dedoc.git
cd zero1-dedoc
ONNXRUNTIME_NODE_INSTALL=skip npm ci
npm run build
node dist/cli.js document.pdf -o document.md
```

Use `node dist/cli.js --help` for the inherited parser, form, rendering, and generation commands. After a local package install, the binaries are `zero1-dedoc` and `zero1-dedoc-mcp`. They can coexist with the original `kordoc` binaries. The public library API remains `parse(input, options)` with `ParseResult.markdown`, `blocks`, `pages`, and `metadata`.

The built `zero1-dedoc setup` command registers the local MCP bundle directly. It does not fetch an unpublished package from npm. For production use, pin this repository to a reviewed commit and keep document parsing in an isolated runtime.

## PDF quality and scope

- The German BMF tax report passes official workbook-backed cell, header, and merge gold on all 11 pages: 3,076/3,076 displayed values in the correct table cells. Page 3 retains two separate tables. [Evaluation details](docs/benchmarks/bmf-dense-grid-recovery.md).
- The German solvency forms retain `Formular F.701.01` through `F.705.01` in the complete 29-page document. Genuine running page numbers are still filtered.
- DOCX inline equations retain their original position among surrounding text runs. Superscript/subscript output is available through the inherited `scriptTags` option.
- PPTX slide order, titles, text shapes, merged tables, and speaker notes are parsed into the same `IRBlock[]` contract across library, CLI, worker, and MCP parse tools. Six public decks passed the [PPTX holdout](docs/benchmarks/pptx-holdout-and-surfaces.md). Chart data and picture text remain explicit `UNSUPPORTED_ELEMENT` warnings; editing and form filling do not support PPTX.
- XLS/XLSX callers can opt in to `parse(input, { includeCellProvenance: true })`. Each emitted table cell then carries its source address, stored type and raw value in `cell.sourceCell`; formula cache state and merge range are included when present. Markdown still uses the readable cell text. A formula with no cached result raises `PARTIAL_PARSE` rather than inventing a value. [Office cell validation](docs/benchmarks/office-cell-provenance.md).
- Built-in OCR accepts `ocrLanguage: "korean" | "en" | "de"` and keeps each recognizer/dictionary in a separate SHA-verified cache. German/English OCR requires running `zero1-dedoc check-ocr-models --language de|en` before an offline parse.
- The public 200-document [OpenDataLoader benchmark](https://github.com/opendataloader-project/opendataloader-bench) is the English-heavy regression gate. The latest no-OCR rerun parsed **200/200** documents with overall **0.93707**, reading order **0.93804**, table **0.93570**, and heading **0.93271**. It is a non-regression signal for the PDF changes, not a claim of universal English accuracy. See [benchmark evidence](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks/zero1-multilingual-foundation.md).

These are measured cases, not a claim of universal German or English accuracy. German OCR now uses SHA-pinned PP-OCRv6 medium models and oriented line crops; English and Korean retain their PP-OCRv5 profiles. Prepare the new German cache with `zero1-dedoc check-ocr-models --language de` before offline parsing. See the [German PDF comparison](docs/benchmarks/german-pdf-ocr-comparison.md) for fixed inputs, competitor settings, accuracy, and limits.

## Attribution and maintenance

Kordoc's original author is [chrisryugj](https://github.com/chrisryugj). The original detailed manuals remain in [README-UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-UPSTREAM.md) and [README-EN.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-EN.md). Git remote `upstream` points to the original project. Zero1 Dedoc's changes are described in [docs/UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/UPSTREAM.md) and [CHANGELOG.md](https://github.com/timothyc012/zero1-dedoc/blob/main/CHANGELOG.md). The inherited plugin and public Kordoc documentation may show legacy package names; use the commands in this README for Zero1 Dedoc.

## 📊 성능

The inherited Kordoc performance details are preserved in [README-UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-UPSTREAM.md#-성능) and [docs/benchmarks.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks.md). Zero1 Dedoc's independently rerun English-heavy benchmark and German cases are recorded separately in [docs/benchmarks/zero1-multilingual-foundation.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks/zero1-multilingual-foundation.md).
