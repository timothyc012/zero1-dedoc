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

Upstream v4.16.3 (`bb71f7fb0bf51dd456d27505a8c04772df182144`) has been fetched and checked out in a separate reference clone. Its generation-image access fix and superscript/subscript support are candidates for the next fork updates. They have not yet been incorporated into Zero1 Dedoc. The [Office/PDF improvement plan](plans/2026-09-29-office-pdf-improvements.md) records the exact commits, source references, conflict boundaries, and validation gates. The current user-requested corpus scope is Office, PDF, and German/English scans; it excludes dedicated HWP corpus evaluation.
