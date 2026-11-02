import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { renderHwpxPages } from "../src/render/svg-render.js"

// 3겹 중첩(70행 표 칸 → 1칸 틀 → 26행 표)이 여러 쪽에 갈린 시험 문서. 한컴 PDF: 이어진 쪽(44쪽) 안쪽 표 반복 머리 행 "부품" 기준선 102.0pt
// = 본문 위 + 바깥 두 겹의 표 바깥 위·칸 위 여백(141 + 425 + 140 + 141) 위 — 종전엔 본문 위에서 다시 세어 7pt 위(95.0)
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "bench", "corpus", "rhwp", "table_giant_cell_overfill.hwpx")

describe("render: 여러 겹 중첩 표가 갈린 이어진 쪽 시작", { skip: !existsSync(FILE) }, () => {
  it("이어진 쪽의 반복 머리 행은 바깥 겹 여백을 모두 쌓은 자리", async () => {
    const r = await renderHwpxPages(readFileSync(FILE))
    const m = String(r.pageSvgs.get(44) ?? "").match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>\s*부품<\/text>/)
    assert.ok(m, "44쪽 머리 행 '부품'")
    assert.ok(Math.abs(Number(m[1]) - 102.0) <= 1.5, `기준선 ${m[1]}`)
  })
})
