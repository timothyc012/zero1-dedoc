# BMF tax tables, pages 4–11: grid and cell diagnosis

This is the P1 diagnostic for the [September 2026 BMF tax PDF](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/2026-09-22-steuereinnahmen-august-2026.pdf?__blob=publicationFile&v=2) and its [official companion XLSX](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/2026-09-22-steuereinnahmen-august-2026-xlxs.xlsx?__blob=publicationFile&v=2). Both are linked from the [BMF monthly download table](https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Steuerschaetzungen_und_Steuereinnahmen/1-kassenmaessige-steuereinnahmen-nach-steuerarten-und-gebietskoerperschaften.html). SHA-256 is fixed in [`bench/office-pdf-gold.json`](../../bench/office-pdf-gold.json); public source binaries remain outside Git.

## Reproduce the source gold and trace

Place the hash-matched BMF PDF and XLSX in `bench/corpus/office-pdf/` as `bmf-tax-tables.pdf` and `bmf-tax-tables.xlsx`. Then run:

```sh
npm ci && npm run build
node bench/build-bmf-gold.mjs /tmp/rebuilt-bmf-gold.json
node bench/verify-bmf-gold.mjs
node --import tsx bench/pdf-grid-trace.mjs --pages 4-11 --out bench/out/bmf-grid-trace
node bench/score-bmf-gold.mjs
```

The gold builder reads workbook OOXML, with actual sheet relationships and source cell addresses, independently of the Zero1 parser. The saved gold maps pages 4–7 to sheet `5 Länder` and pages 8–11 to `5a Länder`. Each sheet is printed in four panels. Pages 4/5 and 8/9 have one label column plus ten state columns (`F:O`); pages 6/7 and 10/11 have one label column plus Berlin, Brandenburg, Mecklenburg-Vorpommern, Sachsen, Sachsen-Anhalt, Thüringen, Gebiet A, Gebiet B, Bundesgebiet (`P:U`, `W`, `X`, `Z`). The split is rows 5–43 then 44–83, with the row-4 header repeated. Workbook blank separator rows are excluded; section merges and source addresses are retained. Rows 84–85 are notes below pages 7/11, and each `Seite n von 4` footer is outside the table.

`verify-bmf-gold.mjs` uses **Poppler `pdftotext`**, independently of PDF.js and Zero1, to compare the workbook's formatted display values with the printed PDF page by page. It finds all **2,356/2,356** values, including duplicates, negative zero, `x`, and German thousand separators: 310 each on pages 4/5/8/9 and 279 each on pages 6/7/10/11. Rendered pages were also inspected to confirm column order, section bands, repeated headers, and footer placement. This check establishes displayed token presence on the correct PDF page; it does not by itself prove every OCR or text-item coordinate.

The trace script writes one SVG and full JSON per page under ignored `bench/out/bmf-grid-trace/`. In the SVG, blue is processed rules, purple is candidate clip grids, green is the physical line grid, red is the grid retained by the **current** selection rule, and orange dots are text items unassigned to those candidate grids. JSON also records `lineAfterContainer`, the old geometry-only selector's result, so the original failure remains visible after the repair. JSON preserves raw/processed line coordinates, clip stages and containers, line grids, candidate cell spans, text-to-cell affiliation, and final parser table shapes. All eight BMF pages have rotation 0 and CropBox origin `(0,0)`, so this failure is not a rotation or coordinate-shift mismatch. The trace independently reruns the exported line/clip stages on normalized PDF.js text and appends the real parser's final IR; it is an opt-in diagnostic, not an alternate parser result.

## Where the tables break

| PDF pages | Workbook gold | Physical line grid before container filter | Zero1 final IR | Current displayed values in IR |
| --- | --- | --- | --- | ---: |
| 4, 8 | 36×11, four full-width sections | 36×11, 4 merged full-width cells | six table blocks; largest 31×11; footer enters a cell | 310/310 each |
| 5, 9 | 38×11, six full-width sections | 38×11, 9 detected full-width spans | two table blocks; largest 31×11; footer enters a cell | 310/310 each |
| 6, 10 | 36×10, four full-width sections | 36×10, 4 detected full-width spans | ten table blocks, including label/value bands | 207/279 and 208/279 |
| 7, 11 | 38×10, six full-width sections | 38×10, 9 detected full-width spans | twelve table blocks, including label/value bands | 155/279 each |

The physical grid already has the **correct row and column count on all eight pages**. Its cell mapper assigns 332–371 text items per page. In `dropGridsInside`, the grid survives comparison with actual clip grids (`lineAfterClip=1`) but is removed after comparison with broad clip **containers** (`lineAfterContainer=0`) on every page. On pages 4/5/8/9 a page-sized container overlaps over 94% of the physical grid; on pages 6/7/10/11 the numeric-panel container overlaps 70–75%. The parser then falls back to smaller clip fragments and secondary reconstruction, which explains the different output defects. The clip filter, rather than PDF line detection, is the first confirmed break point.

This is a positive example for preferring an independently ruled dense table over a broad print-area clip container. The existing [`pdf-clip-cells.test.ts`](../../tests/pdf-clip-cells.test.ts) contains the negative form-container example: a shallow 3×3 frame inside a genuine one-cell form container must still be discarded, with its nested seal table handled separately. A later parser change must make these two cases diverge on **physical rule density and text-to-cell evidence**, and keep separately boxed tables, notes, and side panels apart. Merely joining output Markdown fragments or splitting strings will not satisfy the gold.

[`bench/bmf-gold-baseline.json`](../../bench/bmf-gold-baseline.json) records the `63e6bc1` parser result: 0/8 full-page tables and 1,965/2,356 displayed values. `score-bmf-gold.mjs` requires exact printed row/column count, each displayed value in its **source-aligned row and column**, all labels and repeated headers, section spans, and footer placement before marking a page passed. The old line-detector candidate had nine full-width spans on pages 5/7/9/11 although the workbook has six section rows; the repaired cell extractor uses item positions and an adjacent ruled row to recover the numeric subtotal row while leaving actual section rows merged.
