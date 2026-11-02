#!/usr/bin/env node
/**
 * 발행 게이트 — 배포본이 끌어오는 의존성(운영·선택, devDependencies 제외)의 라이선스가 허용 목록 안인지 확인한다.
 *
 * kordoc 은 Apache-2.0 이고 공공기관 배포를 전제로 한다. GPL·AGPL 같은 상호주의 라이선스나 라이선스 미상 패키지가
 * 의존성 트리에 들어오면 재배포 조건이 바뀌므로, package-lock.json 의 각 패키지 license 필드(SPDX 식)를 검사한다.
 * "A OR B" 는 하나만 허용 목록이면 통과(그 라이선스를 고른다), "A AND B" 는 모두 허용이어야 통과.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ALLOWED = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Zlib", "Python-2.0", "BlueOak-1.0.0", "CC0-1.0", "Unlicense"])

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))

/** SPDX 식 판정 — 괄호·OR·AND 만 쓰는 단순 식 */
function allowed(expr) {
  const s = expr.trim().replace(/^\((.*)\)$/, "$1")
  if (/\bOR\b/.test(s)) return s.split(/\bOR\b/).some(allowed)
  if (/\bAND\b/.test(s)) return s.split(/\bAND\b/).every(allowed)
  return ALLOWED.has(s.trim())
}

const bad = []
let count = 0
for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
  if (!path || pkg.dev) continue
  count++
  const lic = typeof pkg.license === "string" ? pkg.license : ""
  if (!lic || !allowed(lic)) bad.push(`${path.replace(/^.*node_modules\//, "")}@${pkg.version ?? "?"}: ${lic || "(라이선스 미상)"}`)
}

if (bad.length) {
  console.error(`❌ 허용 목록 밖 라이선스 ${bad.length}건 (배포 의존성 ${count}개 중):\n  ${bad.join("\n  ")}`)
  process.exit(1)
}
console.log(`✅ 배포 의존성 ${count}개 라이선스 모두 허용 목록 안`)
