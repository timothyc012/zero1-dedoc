# Zero1 Dedoc Multilingual Foundation Implementation Plan

> **For agentic workers:** Execute the tasks in order, preserving the regression evidence before changing parser behavior. This session uses native inline execution; no subagents are required.

**Goal:** Create a clearly attributed Zero1 Dedoc fork that repairs two verified German PDF failures and measures English and Korean regressions before release.

**Architecture:** Keep the upstream parser and IR contract. Add one geometry-based clip/ruled-grid arbitration step and one page-counter-aware header classifier. Expose Zero1 Dedoc package and CLI identities without rewriting internal modules.

**Tech Stack:** TypeScript 5.9, Node ≥20, pdfjs-dist, tsx/node:test, public OpenDataLoader benchmark.

**Spec:** `docs/superpowers/specs/2026-09-29-zero1-dedoc-multilingual-foundation-design.md`

**Execution status (2026-09-29):** Parser fixes, identity, German smoke, public English benchmark, and repository tests have been verified. Final Git integration remains.

## Global Constraints

- Preserve upstream Git history, MIT license, `NOTICE`, and all third-party attribution.
- Keep HWP/HWPX and public `parse()`/`ParseResult` behavior compatible.
- German PDF fixes must not lower the public English benchmark or the existing Korean regression suite without a documented reason.
- Do not change the benchmark truth, evaluator, excluded set, or the 02ontology PDF default.
- Do not publish to npm in this run. The npm package identity and CLI name are `zero1-dedoc`.

## Review Focus

1. A wide clip grid inside a legitimate HWP nested table must remain intact.
2. A sparse but genuine printed page number must still be removed from headers/footers.
3. Numbered form, section, and table titles must remain even when three or more have the same typography.
4. English heading hierarchy and table structure must be compared on the same frozen 200-document benchmark before and after.
5. Existing Korean HWP/HWPX/PDF and CLI/MCP paths must still pass their applicable tests.

---

### Task 1: Baseline and benchmark inputs

**Files:** Create `docs/benchmarks/multilingual-foundation.md`; use external inputs in `/private/tmp/odl-bench` and the existing 02ontology comparison artifact. No benchmark PDF is committed.

**Interfaces:** Input is Kordoc v4.16.1 commit `878b7009` and OpenDataLoader benchmark commit `7af1d8f4`. Output is immutable baseline numbers plus exact input hashes.

- [ ] Record the BMF PDF/XLSX and solvency PDF hashes from the comparison artifact; keep their official source URLs.
- [ ] Install project dependencies with `ONNXRUNTIME_NODE_INSTALL=skip npm ci`, then `npm run typecheck && npm run build`.
- [ ] Run the public benchmark with `node bench/odl-bench.mjs /private/tmp/odl-bench`, followed by that repository's unmodified evaluator for engine `kordoc`; save the JSON and per-document output outside the Dedoc Git tree.
- [ ] Record test availability for the private Korean corpus; never substitute its absence with a passing score.

### Task 2: Preserve numbered form headings

**Files:** Modify `src/pdf/block-detect.ts`; add cases in `tests/pdf-table-note-footer.test.ts`.

**Interfaces:** `removeHeaderFooterBlocks(blocks, pageHeights, warnings, notes?, tables?)` retains its signature. Its numeric-variation bypass uses a printed page counter rather than any changed digits.

- [ ] Add a failing synthetic test with top-zone blocks `Formular F.701.01`, `F.702.01`, `F.703.01` on PDF pages 2, 8, 14; expected removed indices `[]`.
- [ ] Add a positive running-page test with `Seite 2`, `Seite 8`, `Seite 14` at matching PDF page numbers; expected all three removed despite sparse spacing.
- [ ] Run `node --import tsx --test tests/pdf-table-note-footer.test.ts` and observe the new negative case fail.
- [ ] Implement page-counter detection: a numeric token position must differ from the physical page number by the same offset across occurrences before it bypasses the 40% density requirement.
- [ ] Rerun focused tests and parse the 29-page German solvency PDF; verify `Formular F.701.01` through `F.705.01` all remain.
- [ ] Commit the tested fix independently.

### Task 3: Prefer a demonstrably complete ruled grid

**Files:** Modify `src/pdf/table-grid.ts`, `src/pdf/page-blocks.ts`, and `src/pdf/table-parts.ts`; add cases in `tests/pdf-nonhancom.test.ts` and `tests/pdf-table-parts.test.ts`.

**Interfaces:** New `dropCoarseClipGrids(clipGrids, lineGrids, verticals): TableGrid[]` runs after existing clip filters and before `extractBlocksWithGrids` claims text items.

- [ ] Add a failing grid test: a 47×7 ruled grid with the same outer X bounds as several full-width 1-column clip bands must return no competing coarse bands when the interior vertical rules span their overlap.
- [ ] Add protection tests: a clip-only form and a `clipParent` nested grid remain; missing/intermittent interior vertical rules keep the clip.
- [ ] Run `node --import tsx --test tests/pdf-nonhancom.test.ts` and observe the regression fail.
- [ ] Implement a geometry and rule-coverage filter. Do not suppress all clip grids or special-case the BMF filename or German words.
- [ ] Parse the BMF first page; require one 47×7 table with the official XLSX `Lohnsteuer` values in one row. Run focused Korean clip and nested-table tests.
- [ ] Add a failing cross-page test for a second ruled table that begins with a new institution/date and full-width title; keep it separate from the previous same-column table. Require BMF pages 1–3 to remain 47×7, 50×7, and 44×7.
- [ ] Commit the tested fix independently.

### Task 4: Zero1 Dedoc identity with compatibility

**Files:** Modify `package.json`, `package-lock.json`, `src/cli.ts`, `src/mcp.ts`, `README.md`; add `docs/UPSTREAM.md` and packaging tests if the existing CLI tests lack assertions.

**Interfaces:** `import {parse} from "zero1-dedoc"` and `zero1-dedoc <file>` work alongside an installed Kordoc. Parser API types remain unchanged.

- [ ] Change the package name to `zero1-dedoc` and install only `zero1-dedoc`/`zero1-dedoc-mcp` binary names; update lockfile with npm.
- [ ] Change visible CLI/MCP product name to Zero1 Dedoc; keep internal upstream identifiers when changing them would break serialized contracts.
- [ ] Add a short README landing section for multilingual scope, upstream attribution, known limitations, and benchmark evidence; link original README for inherited tools.
- [ ] Run `npm run typecheck`, `npm test`, `npm run build`, and CLI/MCP smoke checks from built output.
- [ ] Commit identity and documentation after validation.

### Task 5: Final evaluation and integration

**Files:** Update `docs/benchmarks/multilingual-foundation.md` and `CHANGELOG.md` only for measured results. Do not alter benchmark source truth.

- [ ] Re-run the same German inputs, English 200-document evaluator, and relevant Korean tests. Compare against Task 1 by document and metric; investigate any lower score.
- [ ] Run `npm run typecheck && npm test && npm run build`; run `npm run bench:gate` only where its required private corpus is present and report its status.
- [ ] Verify `LICENSE`, `NOTICE`, `THIRD_PARTY`, package metadata, npm tarball contents (`npm pack --dry-run`), Git diff, and clean status.
- [ ] Push the verified branch, integrate to `main` according to this fork's AGENTS.md convention, and push `main`; leave npm unpublished.
