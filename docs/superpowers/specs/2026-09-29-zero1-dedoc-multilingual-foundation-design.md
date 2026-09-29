# Zero1 Dedoc multilingual foundation

**Status:** Initial scope for the first fork release. The repository inherits Kordoc v4.16.1 and its Git history.

## Purpose

Zero1 Dedoc is a local document parser that keeps the existing Korean HWP/HWPX and document tools while making born-digital German and English PDFs reliable for downstream evidence extraction. Its first release is a measured fork, not a claim that every language or scanned document is solved.

## Product boundary

- Repository: `timothyc012/zero1-dedoc`, with `chrisryugj/kordoc` as upstream. Preserve MIT `LICENSE`, `NOTICE`, third-party notices, and original commit history.
- npm identity: `zero1-dedoc`; the unscoped `dedoc` name belongs to another package. Provide `zero1-dedoc` and `zero1-dedoc-mcp` binaries so the fork can coexist with Kordoc. Do not publish to npm during this work.
- Library `parse()` and the `ParseResult`/`IRBlock` contract stay compatible. PDF layout fixes belong in the shared parser, not in a 02ontology postprocessor.
- The first quality gate covers text-layer PDFs. OCR model routing for German and English scans is a separate milestone; no multilingual OCR claim is made until a scanned-page gold set passes.
- 02ontology keeps `pdf auto → OpenDataLoader` and uses Dedoc only by explicit selection until the promotion gate passes.

## Parser changes

1. **Ruled table priority.** The BMF tax PDF produces a correct 47×7 ruled grid and several coarser full-width clip grids. Add a narrow coarse-clip filter before grid consumption. Prefer the ruled grid only when its outer edges align with the clip region and real interior vertical rules span the overlapping rows. Preserve nested clip tables and clip-only tables.
2. **Repeated header classification.** Numeric normalization currently treats `Formular F.701.01`, `F.702.01`, and `F.703.01` as the same running header. A varying number can bypass the density check only if a token behaves like the physical page counter (constant offset from the PDF page index). Section/form/table identifiers remain document content.
3. **Language neutrality.** Keep geometric table decisions and page-counter decisions independent of German or Korean strings. Add explicit German and English regression cases while checking existing Korean cases.
4. **Independent tables across pages.** A new overview can print its institution/date and title inside the first rows of a ruled grid. Keep that table separate from the prior page's table even when both have the same columns.

## Evidence and acceptance

- German BMF PDF: pages 1–3 remain separate 47×7, 50×7, and 44×7 tables; page 1 retains the official XLSX row `Lohnsteuer` with six values in the corresponding columns.
- German solvency forms: five `Formular F.701.01`–`F.705.01` headings retained in the 29-page PDF; a three-page minimal case demonstrates the repeated-header threshold.
- English: run the unmodified public OpenDataLoader 200-document evaluator against the upstream baseline and Dedoc after the changes. Record aggregate and per-document deltas for reading order, tables, and headings. No improvement claim from a selected example alone.
- Korean: run repository tests and the relevant PDF clip/header tests. Run the full private corpus gate only where that corpus exists; record its availability and result explicitly.
- Resource behavior: check elapsed time and peak memory on the German cases and the English benchmark; reject a material regression without investigation.

## Release boundary

Make reviewable commits on `codex/zero1-dedoc-multilingual`. After tests and benchmark evidence, integrate the verified branch into the fork's `main` and push. Do not publish an npm package or change 02ontology's PDF default as part of this initial work.
