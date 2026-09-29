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

- The German BMF tax report's first page is recovered as one 47-row, 7-column table. Its `Lohnsteuer` row retains six values in the official [XLSX](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/2026-09-22-steuereinnahmen-august-2026-xlxs.xlsx?__blob=publicationFile&v=2) columns. The first three PDF pages remain separate tables.
- The German solvency forms retain `Formular F.701.01` through `F.705.01` in the complete 29-page document. Genuine running page numbers are still filtered.
- DOCX inline equations retain their original position among surrounding text runs. Superscript/subscript output is available through the inherited `scriptTags` option.
- PPTX slide order, titles, text shapes, tables, and speaker notes are parsed into the same `IRBlock[]` contract. Unsupported or malformed package parts return an explicit PPTX error.
- The public 200-document [OpenDataLoader benchmark](https://github.com/opendataloader-project/opendataloader-bench) is the English-heavy regression gate. No OCR: overall **0.93705**, reading order **0.93803**, table **0.93570**, heading **0.93265**, with 200/200 documents parsed. The fork's PDF fixes changed no per-document score relative to its Kordoc v4.16.1 base. See [benchmark evidence](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks/zero1-multilingual-foundation.md).

These are measured cases, not a claim of universal German or English accuracy. The built-in OCR recognition model is still Korean PP-OCRv5, which includes Latin characters but has **not** been validated as a German or English scanned-document model. Multilingual OCR remains a separate milestone.

## Attribution and maintenance

Kordoc's original author is [chrisryugj](https://github.com/chrisryugj). The original detailed manuals remain in [README-UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-UPSTREAM.md) and [README-EN.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-EN.md). Git remote `upstream` points to the original project. Zero1 Dedoc's changes are described in [docs/UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/UPSTREAM.md) and [CHANGELOG.md](https://github.com/timothyc012/zero1-dedoc/blob/main/CHANGELOG.md). The inherited plugin and public Kordoc documentation may show legacy package names; use the commands in this README for Zero1 Dedoc.

## 📊 성능

The inherited Kordoc performance details are preserved in [README-UPSTREAM.md](https://github.com/timothyc012/zero1-dedoc/blob/main/README-UPSTREAM.md#-성능) and [docs/benchmarks.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks.md). Zero1 Dedoc's independently rerun English-heavy benchmark and German cases are recorded separately in [docs/benchmarks/zero1-multilingual-foundation.md](https://github.com/timothyc012/zero1-dedoc/blob/main/docs/benchmarks/zero1-multilingual-foundation.md).
