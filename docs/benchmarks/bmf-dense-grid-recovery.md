# BMF dense ruled table recovery

The [P1 trace and workbook gold](bmf-page-grid-diagnosis.md) located the first loss in the broad clip-container filter. The repair gives a physical line grid priority only when it has at least 20 rows and seven columns, a mostly populated cell matrix, and at least 85% of its in-grid text items assigned to cells. Clip fragments that overlap the reliable grid are removed; a true nested clip table confined to one physical cell stays separate. Shallow form containers and side boxes that merely touch a table border continue through the existing clip path. An unruled numeric subtotal row is split by **source text coordinates** only when every established column has an item and a neighboring row has physical vertical rules. Section bands with sparse text remain merged. There is no Markdown-fragment join or numeric-string split.

For the first three pages, [`bench/bmf-front-gold.json`](../../bench/bmf-front-gold.json) maps the remaining official workbook sheets to 47×7 and 50×7 tables on pages 1/2 and **two separate** 20×7 and 23×7 tables on page 3. The old parser combined those page-3 tables into one 44×7 table, placing the intervening `Übersicht 4` caption inside a cell. The line-grid merger now checks for independent text in the gap before joining same-column grids. Both workbook-derived gold files were verified against the published PDF with independent Poppler extraction: **720/720** front-page values and **2,356/2,356** later values on the right pages.

With the hash-matched files in `bench/corpus/office-pdf/`, rebuild and verify the front gold with `node bench/build-bmf-front-gold.mjs /tmp/bmf-front-rebuilt.json`, `node bench/verify-bmf-front-gold.mjs`, and `node bench/score-bmf-front-gold.mjs`. The later-page commands are in the [P1 diagnosis](bmf-page-grid-diagnosis.md). Both scorers report row/column alignment, not only page-level token recall.

| BMF 11 pages | Before (`63e6bc1`) | Repaired branch |
| --- | ---: | ---: |
| Pages passing workbook cell, header, label, merge and footer gold | 2/11 | **11/11** |
| Displayed values present on the right PDF page | 2,685/3,076 | **3,076/3,076** |
| Displayed values in the correct table row and column | 504/3,076 | **3,076/3,076** |
| First three PDF table shapes | 47×7, 50×7, one 44×7 | 47×7, 50×7, separate 20×7 + 23×7 |
| Pension form identifiers | 5/5 | 5/5 |

The hash-pinned German smoke now scores both complete workbook gold files instead of asserting the former 31-row fragment shapes. `npm run bench:german-smoke -- <BMF PDF> <pension form PDF>` passed with eleven pages and 3,076 aligned values. The 20-document Office/PDF development gate parsed 20/20 and reported no regression; its separate baseline evaluator was unchanged.

The public ODL200 PDFs were rerun with `ocr:false,images:false` and the unmodified evaluator at `7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109`. All 200 parsed. All 200 prediction Markdown files and the complete evaluator JSON were byte-identical to the [previous complete report](data/zero1-page-lead-guard-odl200.json) (SHA-256 `4f51a16d22b3436e9329e2fbb06559090c0e78f6b5ec2bb14593205e8739c284`). Overall `0.937073892`, NID `0.938037332`, TEDS `0.935699400`, and MHS `0.932713617` did not change; every per-document delta was zero.

The existing form-container test and new synthetic tests cover a dense 36×10 grid with a broad clip, a shallow 3×3 form frame, an independent box beside or touching the table, a nested clip table inside one physical cell, a numeric row after a section band, a detached numeric note that must stay merged, and adjacent same-column tables with/without a caption in the gap. In three alternating fresh Node processes on this Mac, median BMF parse time was **361 ms before vs 367 ms after** and RSS after BMF was **219 MB vs 220 MB**. The pension form ran after BMF in each process: median **287 ms vs 281 ms**. These are small local samples, not a stable throughput benchmark.

This passes the **BMF development corpus** and preserves the public ODL200 output. It does not establish quality across independent German agencies or scanned documents, so PDF `auto` promotion remains a separate gate.
