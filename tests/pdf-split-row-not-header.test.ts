import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { ROW_RULES } from "../src/pdf/table-meta.js"
import type { IRCell, IRTable } from "../src/types.js"

const cell = (text: string): IRCell => ({ text, colSpan: 1, rowSpan: 1 })
const table = (cells: IRCell[][]): IRTable => ({ rows: cells.length, cols: cells[0].length, cells, hasHeader: false })
const count = (t: IRTable, s: string) => t.cells.flat().map(c => c.text.split(s).length - 1).reduce((a, b) => a + b, 0)

// 쪽마다 바닥 행이 갈려 넘어가는 표 — 앞 조각(가운데 쪽) 첫 행도 그 앞 쪽에서 갈려 온 "명령 6개월" 조각이라 뒤 조각 첫 행과 글이 같다
function parts(open: boolean) {
  const prev = table([[cell(""), cell("명령 6개월")], [cell("5) 행위"), cell("시정명령, 업무정지")]])
  const curr = table([[cell(""), cell("명령 6개월")], [cell("6) 행위"), cell("시정명령, 업무정지 명령 6개월")]])
  ROW_RULES.set(prev, { top: !open, bottom: !open, innerRuled: 1, innerOpen: 0 })
  ROW_RULES.set(curr, { top: !open, bottom: !open, innerRuled: 1, innerOpen: 0 })
  return joinSplitParts(prev, [0, 100, 300], curr, [0, 100, 300])!
}

describe("pdf: 쪽 경계가 열린 갈린 행의 이어짐은 되풀이 머리 행이 아니다", () => {
  it("앞 조각 밑변·뒤 조각 윗변이 열렸으면 앞 조각 첫 행과 같은 글이어도 남긴다", () => {
    assert.equal(count(parts(true).table, "명령 6개월"), 3)
  })
  it("쪽 경계에 괘선이 있으면 종전대로 되풀이 머리 행으로 뺀다", () => {
    assert.equal(count(parts(false).table, "명령 6개월"), 2)
  })
})
