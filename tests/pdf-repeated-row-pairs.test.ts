import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRTable } from "../src/types.js"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { CELL_LINES, ROW_RULES } from "../src/pdf/table-meta.js"

const A = ["열간내압크리프성", "KS M ISO 1167"], B = ["용출성", "KS M 3401"]
function joined(mode = "same", ruled = true) {
  const rows = mode === "separated" ? [A, ["다른 시험", "다른 규격"], B, A] : mode === "missing" ? [A] : [A, B, A]
  const make = (data: string[][]): IRTable => ({ rows: data.length, cols: 2, hasHeader: false,
    cells: data.map(row => row.map(text => ({ text, rowSpan: 1, colSpan: 1 }))) })
  const prev = make(rows), next = make([B])
  if (mode === "different") prev.cells[1][1].text = "KS M 3404"
  if (mode === "reversed") [prev.cells[0], prev.cells[1]] = [prev.cells[1], prev.cells[0]]
  if (mode === "whitespace") prev.cells[0][1].text = "KS M\nISO 1167"
  for (const t of [prev, next]) {
    if (ruled) ROW_RULES.set(t, { top: true, bottom: true, innerRuled: 6, innerOpen: 0 })
    for (const row of t.cells) {
      const upper = row[0].text === A[0], y = t === prev ? 34 : 756
      CELL_LINES.set(row[0], [{ l: 174, r: upper ? 254 : 204, y, h: 10 }])
      CELL_LINES.set(row[1], [{ l: upper ? 272 : 283, r: upper ? 350 : 339, y, h: 10 }])
    }
  }
  return { result: joinSplitParts(prev, [171.388, 258.341, 363.884], next, [171.388, 258.341, 363.884], 0, 29.847)!, expectedRows: prev.rows + 1 }
}
describe("같은 표의 독립된 행 쌍", () => {
  for (const mode of ["same", "whitespace"]) it(`${mode}: 같은 두 열의 독립 행 쌍이 이미 있으면 쪽 경계도 별도 행이다`, () => {
    const { result, expectedRows } = joined(mode)
    assert.equal(result.split, false)
    assert.equal(result.table.rows, expectedRows)
    assert.deepEqual(result.table.cells.slice(-2).map(row => row.map(c => c.text)), [A, B])
  })
  for (const mode of ["different", "reversed", "separated", "missing"]) it(`${mode}: 불완전한 증거로 기존 줄 이어짐을 막지 않는다`, () => {
    const { result, expectedRows } = joined(mode)
    assert.equal(result.split, true)
    assert.equal(result.table.rows, expectedRows - 1)
  })
  it("쪽 경계 괘선 증거가 없으면 기존 줄 이어짐을 유지한다", () => {
    assert.equal(joined("same", false).result.split, true)
  })
})
