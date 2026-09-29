# PDF heading-role negative holdout

Two public PDFs from issuers outside the development comparison were rendered and annotated for heading roles: the [ECB monetary press release distributed by Bundesbank](https://www.bundesbank.de/resource/blob/988688/301029e85c8ac038cd5e88131e2ad8d1/472B63F073F071307366337C94F8C870/2026-01-29-geldmenge-download.pdf) (9 pages) and the [Destatis GDP 2025 press-conference statement](https://www.destatis.de/DE/Presse/Pressekonferenzen/2026/bip2025/statement-bip.pdf?__blob=publicationFile&v=4) (20 pages). The [public ODL185 PDF](https://github.com/opendataloader-project/opendataloader-bench/blob/7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109/pdfs/01030000000185.pdf) checks the inherited author superscripts; it is a benchmark cross-check, **not** an independent issuer holdout. URLs, SHA-256 values, fixed options, and specific positive/negative labels are in [`bench/heading-negative-manifest.json`](../../bench/heading-negative-manifest.json).

Run `npm run build` and `npm run bench:heading-holdout -- --fetch` from the repository root. Downloaded public files are hash-checked before use and stored in ignored `bench/corpus/heading-holdout/`. The gate writes ignored `bench/out/heading-negative-holdout.json`. The full [pre-fix report](data/zero1-heading-negative-before.json) and [accepted result](../../bench/heading-negative-baseline.json) retain all document-level checks.

| Role check | Before `5a92a6d` | After implementation `644e411` |
| --- | ---: | ---: |
| Hash-matched documents parsed | 3/3 | 3/3 |
| Exact heading/negative/text checks | 23/30 | **30/30** |
| Bundesbank/ECB short masthead `Pressemitteilung` | H1 | paragraph |
| Its 20pt document title | H1 | H1 |
| Its 16pt sections on pages 1, 3, 4 | H1 | H2 |
| Destatis `Pressekonferenz` masthead | H1 | paragraph |
| Destatis split same-line title | partial H1 + paragraph | complete H1 |
| Destatis page-6 numbered section | H1 | H2 |
| ODL185 author line with ∗/† superscripts | paragraph | paragraph, markers retained |

Visual review of the rendered PDFs fixed the expected levels. Bundesbank page 2's running press header and the figure/table captions must not become H1. Destatis's `– Es gilt das gesprochene Wort –` and `Schaubild 1a` remain paragraphs. The institutional wordmarks on these two PDFs are raster art under `ocr:false`, so their absence from headings is **not** evidence that text-layer logos are always classified correctly. A separate synthetic IR test checks a large all-caps institution wordmark above a larger title. Another synthetic test checks an attributed large pull quote versus a legitimate quoted title. Numbered `Chapter 3/4` markers are explicitly retained as H1: an initial version mistakenly demoted them and lowered two ODL200 MHS scores; that regression was fixed before this accepted result.

The final parser was rerun on all 200 fixed ODL PDFs with `ocr:false,images:false`. All parsed, and all 200 Markdown files were byte-identical to the [previous complete evaluation](data/zero1-page-lead-guard-odl200.json). With the evaluator fixed at `7af1d8f4d0c09f51ea1a5c6ba5f66e993286d109`, overall `0.937073892`, NID `0.938037332`, TEDS `0.935699400`, and MHS `0.932713617` therefore remain unchanged. The 20-document Office/PDF gate and the [11-page BMF cell gold](bmf-dense-grid-recovery.md) also passed. This holdout closes the identified role negatives; it is too small to establish a universal German heading-quality rank or to change PDF `auto`.
