// 메타 동기화 — 수동 3점 정렬 커밋(483b8b5, b0b11fc 등)이 반복되던 드리프트 자동화.
//
//  .claude/skills/gongmunseo/references/engine-spec.md ← docs/gongmunseo-engine-spec.md (정본)
// plugins/kordoc is an upstream snapshot and keeps its upstream version.
//
// 사용: node scripts/sync-meta.mjs          → 드리프트를 실제로 고침
//       node scripts/sync-meta.mjs --check  → 드리프트 있으면 exit 1 (prepublishOnly 게이트용)

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const checkOnly = process.argv.includes("--check")
let drift = 0

// engine-spec SSOT (정본: docs/)
const canonical = join(root, "docs/gongmunseo-engine-spec.md")
const copy = join(root, ".claude/skills/gongmunseo/references/engine-spec.md")
if (existsSync(canonical) && existsSync(copy)) {
  const src = readFileSync(canonical, "utf8")
  if (readFileSync(copy, "utf8") !== src) {
    drift++
    if (checkOnly) {
      console.error("✗ engine-spec.md 드리프트: docs/(정본) ≠ .claude/skills/gongmunseo/references/")
    } else {
      writeFileSync(copy, src)
      console.log("✓ engine-spec.md 동기화 (docs/ → skills/references/)")
    }
  }
}

if (drift === 0) console.log("✓ 메타 동기화 상태 양호 (드리프트 없음)")
else if (checkOnly) {
  console.error(`\n${drift}건 드리프트 — \`node scripts/sync-meta.mjs\` 로 정렬 후 커밋하세요.`)
  process.exit(1)
}
