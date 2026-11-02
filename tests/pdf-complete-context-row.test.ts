import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRTable } from "../src/types.js"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { CELL_LINES, FILLER_CELLS, ROW_RULES } from "../src/pdf/table-meta.js"

function join(peerLabel = "비카트연화온도", peerCode = "KS M ISO 2507-1,\nKS M ISO 2507-2", ruled = true) {
  const make = (rows: string[][]): IRTable => ({ rows: rows.length, cols: 3, hasHeader: false,
    cells: rows.map(row => row.map(text => ({ text, rowSpan: 1, colSpan: 1 }))) })
  const prev = make([["앞 분류", peerLabel, peerCode], ["IDDV", "비카트연화온도", "KS M ISO 2507-1,"]])
  const next = make([["(ISO\n3633)", "", "KS M ISO 2507-2"], ["", "다음 시험", "다음 규격"], ["", "마지막 시험", "마지막 규격"]])
  next.cells[0][0].rowSpan = 3
  FILLER_CELLS.add(next.cells[0][1])
  CELL_LINES.set(prev.cells[1][0], [{ l: 30, r: 55, y: 45, h: 10 }])
  CELL_LINES.set(next.cells[0][0], [{ l: 30, r: 55, y: 770, h: 10 }, { l: 30, r: 55, y: 755, h: 10 }])
  CELL_LINES.set(prev.cells[1][2], [{ l: 230, r: 320, y: 45, h: 10 }])
  CELL_LINES.set(next.cells[0][2], [{ l: 231, r: 319, y: 770, h: 10 }])
  if (ruled) for (const t of [prev, next]) ROW_RULES.set(t, { top: true, bottom: true, innerRuled: 5, innerOpen: 0 })
  return joinSplitParts(prev, [0, 100, 200, 350], next, [0, 100, 200, 350], 0, 40)!
}
describe("완성된 같은 자료행으로 확인되는 쪼개진 셀", () => {
  it("같은 항목과 합친 값이 이미 한 행에 있으면 가운데 정렬 조각도 잇는다", () => {
    const r = join()
    assert.equal(r.split, true)
    assert.equal(r.table.rows, 4)
    assert.equal(r.table.cells[1][1].text, "비카트연화온도")
    assert.equal(r.table.cells[1][2].text, "KS M ISO 2507-1,\nKS M ISO 2507-2")
  })
  for (const [label, code, ruled] of [
    ["다른 시험", "KS M ISO 2507-1,\nKS M ISO 2507-2", true],
    ["비카트연화온도", "KS M ISO 2507-1,\nKS M ISO 2507-3", true],
    ["비카트연화온도", "KS M ISO 2507-2\nKS M ISO 2507-1,", true],
    ["비카트연화온도", "KS M ISO 2507-1,\nKS M ISO 2507-2", false],
  ] as const) it(`${label}/${code.slice(-1)}/${ruled}: 증거가 불충분하면 행을 유지한다`, () => {
    const r = join(label, code, ruled)
    assert.equal(r.split, false)
    assert.equal(r.table.rows, 5)
  })
})
