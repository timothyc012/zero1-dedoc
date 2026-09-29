# PPTX holdout and parser surface gate

Six public, SHA-256 pinned PowerPoint files from [File Format Commons](https://github.com/alexschiller/file-format-commons), [ts-pptx](https://github.com/shbernal/ts-pptx), [Apache POI](https://github.com/apache/poi), and [python-pptx](https://github.com/scanny/python-pptx) were checked independently of the original 20-document Office/PDF development corpus. Exact commit URLs, hashes, expectations, and source roles are in [`bench/pptx-holdout-manifest.json`](../../bench/pptx-holdout-manifest.json). Run `npm run build` then `npm run bench:pptx-holdout -- --fetch` to download missing inputs into ignored `bench/corpus/pptx-holdout/` and compare them. The result is [`bench/pptx-holdout-baseline.json`](../../bench/pptx-holdout-baseline.json); normal runs write ignored `bench/out/pptx-holdout.json`.

| Input | Verified result |
| --- | --- |
| `ffc.pptx` | 1 slide, source text and order preserved |
| `group-transform.pptx` | 2 slides, seven visible labels occur once each in the rendered left-to-right/top-to-bottom order |
| `table-merge-encoding.pptx` | 5 slides, physical table grids `3×3`, `4×4`, `3×3`, `3×3`, `3×3`; first-cell spans and multi-paragraph cell text preserved |
| `scatter-chart.pptx` | title extracted; chart payload is explicitly `UNSUPPORTED_ELEMENT` |
| `prs-notes.pptx` | speaker note `Notes` extracted without the slide-number placeholder |
| `shp-picture.pptx` | 2 image-only slides, four explicit image warnings, no claim of OCR text |

All **6/6** documents parsed, covering **12 slides**. The 68 source slide-text paragraphs were present **68/68** and in source order **68/68**. The four documents with text, groups, tables, and charts also passed the visual labels and geometry assertions derived from rendered slides and native OOXML. Separate synthetic tests cover an image and notes on the same slide, a flipped group whose child XML order differs from visible order, metadata title extraction, and a malformed PPTX. The parser now follows physical `tblGrid` positions and treats `hMerge`/`vMerge` as continuation markers, so merged cells no longer inflate columns. It retains paragraph breaks inside cells.

The library, CLI, NDJSON worker, and MCP `parse_document` all accept a valid `.pptx`; CLI and worker output agree. MCP `detect_format`, `parse_metadata`, `parse_pages`, `parse_table`, and `parse_chunks` use the parse-only extension set. `pages` selects slides in the library/CLI/MCP while the existing worker protocol continues to parse the whole deck. The edit, patch, form-fill, and generation allowlists still reject PPTX. Malformed packages return an explicit parse error; speaker notes exclude slide-number/date/header/footer placeholders. The ZIP precheck and slide-count limit bound parsing resources.

Chart/SmartArt data and text inside pictures remain unsupported and are reported as warnings. The group-position test proves sorting for text children under group transforms; at the top slide level, XML order is still the fallback when visual geometry is incomplete. The six-document result does not claim universal reading order for arbitrary multi-column decks. The original [20-document Office/PDF gate](office-pdf-evaluation.md) still passes 20/20 with no regression, and 02ontology parser routing is unchanged.
