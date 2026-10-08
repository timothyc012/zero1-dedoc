# Production readiness contract

Zero1 Dedoc is used as a document-ingestion boundary for downstream evidence and
review systems. A release is production-ready only when the following contract
is true.

## Public contract

- `parse(input, options)` remains backwards compatible.
- The result exposes `markdown`, `blocks`, `pages`, and `metadata`.
- Structured blocks retain page and bounding-box information when the source
  format provides it.
- Partial or unsupported extraction is reported explicitly; the parser must not
  invent formula results or silently discard unsupported content.
- CLI and MCP entrypoints are shipped together with the library API.

## Operational contract

- Parsing runs in an isolated process for untrusted documents.
- OCR model caches are versioned and integrity checked.
- CPU/GPU selection is explicit in deployment configuration and failures are
  visible to operators.
- Input documents and extracted content are not written to logs by default.
- Resource limits (file size, page count, and execution time) are enforced by
  the embedding service.

## Release gates

Run these before publishing:

```sh
npm run typecheck
npm test
npm run build
npm run verify:package
```

`verify:package` runs `npm pack --dry-run` and checks that the public API,
CLI/MCP entrypoints, and required license notices are actually present in the
publish tarball. It also rejects source/test/benchmark leakage and source maps.

## Evidence required for a customer pilot

Record the following per document family rather than reporting one global
accuracy number:

- field/value accuracy
- table-cell placement accuracy
- amount preservation rate
- page/table/cell provenance coverage
- manual correction rate
- partial/unsupported parse rate
- cold-start and warm processing time

The benchmark report is a regression signal. It is not a universal accuracy
claim for customer documents.
