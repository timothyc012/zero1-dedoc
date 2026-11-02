// 메타 동기화 — 수동 3점 정렬 커밋(483b8b5, b0b11fc 등)이 반복되던 드리프트 자동화.
//
//  .claude/skills/gongmunseo/references/engine-spec.md·logic.md ← docs/gongmunseo-engine-spec.md·gongmun-logic.md (정본)
// plugins/kordoc·server.json 은 upstream 스냅숏이라 upstream 판을 그대로 둔다 (포크는 MCP 레지스트리에 올리지 않는다).
//
// 사용: node scripts/sync-meta.mjs          → 드리프트를 실제로 고침
//       node scripts/sync-meta.mjs --check  → 드리프트 있으면 exit 1 (prepublishOnly 게이트용)

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const checkOnly = process.argv.includes("--check")
let drift = 0

// 2. 스킬 참고 문서 SSOT (정본: docs/) — 엔진 스펙, 구성·윤문 기준
for (const [doc, ref] of [["gongmunseo-engine-spec.md", "engine-spec.md"], ["gongmun-logic.md", "logic.md"]]) {
  const canonical = join(root, "docs", doc)
  const copy = join(root, ".claude/skills/gongmunseo/references", ref)
  if (!existsSync(canonical)) continue
  const src = readFileSync(canonical, "utf8")
  if (!existsSync(copy) || readFileSync(copy, "utf8") !== src) {
    drift++
    if (checkOnly) {
      console.error(`✗ ${ref} 드리프트: docs/${doc}(정본) ≠ .claude/skills/gongmunseo/references/${ref}`)
    } else {
      writeFileSync(copy, src)
      console.log(`✓ ${ref} 동기화 (docs/${doc} → skills/references/)`)
    }
  }
}

if (drift === 0) console.log("✓ 메타 동기화 상태 양호 (드리프트 없음)")
else if (checkOnly) {
  console.error(`\n${drift}건 드리프트 — \`node scripts/sync-meta.mjs\` 로 정렬 후 커밋하세요.`)
  process.exit(1)
}
