# Zero1 Dedoc working rules

- This repository is the `timothyc012/zero1-dedoc` fork of `chrisryugj/kordoc`. Preserve upstream Git history, `LICENSE`, `NOTICE`, and `THIRD_PARTY/` attribution. Read `docs/UPSTREAM.md` when merging upstream changes or changing package identity.
- Keep the `parse()` and `IRBlock` contracts compatible unless the user requests a migration. The inherited `plugins/kordoc` tree is an upstream snapshot, not a Zero1 Dedoc plugin release.
- For PDF quality changes, keep the public OpenDataLoader 200-document ground truth and evaluator fixed. Record before/after per-document reading-order, table, and heading scores; run `bench:german-smoke` on hash-pinned official inputs; run the relevant Korean tests. If the private Korean corpus is absent, report its gate as unverified.
- Work in a `codex/*` branch. After verification, integrate reviewed work to `main` and push when the user asks for a completed improvement. Publish to npm or create a release only when the user specifically requests that distribution step.
- Preserve unrelated working files and other sessions' checkouts. Account for temporary clones and worktrees before the task ends.
