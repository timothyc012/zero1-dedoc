# Office source-cell value and type gate

The six hash-pinned XLS/XLSX files in [`bench/office-pdf-manifest.json`](../../bench/office-pdf-manifest.json) are checked against source-side OOXML cells and Zero1's opt-in `sourceCell` metadata. Run `npm run build` and then `npm run bench:office-cells -- --corpus bench/corpus/office-pdf`. Six small synthetic fixtures are bundled; the public Office inputs must be present in the ignored corpus directory or acquired through the [20-document evaluation command](office-pdf-evaluation.md). The machine-readable result is [`bench/office-cell-provenance-baseline.json`](../../bench/office-cell-provenance-baseline.json); ordinary reruns write ignored `bench/out/office-cell-provenance.json`.

| Check | Result |
| --- | ---: |
| XLS/XLSX documents | 6/6 passed |
| Source cells with matching sheet and address | 4,261/4,261 |
| Source storage type matched | 4,261/4,261 |
| Raw source value matched | 4,261/4,261 |
| Merges with a populated source anchor | 295/295 range identities |
| HGB account-code occurrences | `0420`: 3/3; `0970`: 1/1 |
| HGB date serials with ISO display and numeric raw value | 24 |
| BMF Lohnsteuer row raw-value probes | 6/6 |

The BMF workbook has **315** merge ranges; **20** have no populated source anchor and are not claimed as visible-cell matches. A merge can also contract when entirely empty rows or columns are omitted for Markdown. The source range remains available at the anchor when present. In BMF XLSX, 1,899 visible strings differ from their stored tokens because the parser removes binary floating-point tails; the exact stored values are still in `sourceCell.rawValue`. A numeric date retains its Excel serial raw value while `cell.text` shows the ISO date. A string that merely looks like a date stays typed as a string. These categories are separate from PDF display rounding in the [BMF PDF gold](bmf-dense-grid-recovery.md).

`sourceCell` is **off by default**. `parse(input, { includeCellProvenance: true })` adds `address`, `storedType`, and `rawValue` to emitted XLS/XLSX IR table cells, plus `mergeRange`, `dateFormatted`, `formula`, and `cachedValue` when relevant. This does not change Markdown. For OOXML numbers, `rawValue` is the exact `<v>` text; for shared strings, it is the resolved logical string. For BIFF `.xls`, it is the decoder's canonical representation of the stored double or string. The public `test.xls` is compared to the paired `test.xlsx` fixture, which has identical visible cell values and addresses; this is not an independent byte-level BIFF ground truth.

Formula cases are covered by synthetic source tests because none of the six corpus documents contains formula cells. A cached formula retains only its stored result; an uncached XLSX formula emits the formula text and a `PARTIAL_PARSE` warning, while an uncached BIFF formula leaves its value blank and warns. No formula is evaluated and no absent cached result becomes zero. Existing `TRUNCATED_TABLE` warnings remain the path for row-budget clipping; this change does not alter that budget. The six-document result is a **development regression gate** and does not justify changing 02ontology's Office or PDF `auto` choices.
