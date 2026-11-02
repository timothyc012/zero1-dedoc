import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { ROW_RULES, recordCellLines } from "../src/pdf/table-meta.js"
import type { IRTable } from "../src/types.js"

function parts(marks = ["③", "④", "⑤", "⑥"]): [IRTable, IRTable] {
  const make = (labels: string[]): IRTable => ({ rows: labels.length, cols: 2, hasHeader: false,
    cells: labels.map((s, i) => [
      { text: `${s} 점검 항목\n설명이 줄 끝까지 이어지는`, colSpan: 1, rowSpan: 1 },
      { text: `대상 ${i}\n전체 과제`, colSpan: 1, rowSpan: 1 },
    ]) })
  const a = make(marks.slice(0, -1)), b = make(marks.slice(-1))
  for (const t of [a, b]) {
    ROW_RULES.set(t, { top: true, bottom: true, innerRuled: 4, innerOpen: 0 })
    for (const row of t.cells) {
      recordCellLines(row[0], [{ x: 5, y: 100, w: 100, fontSize: 10, h: 10 }, { x: 5, y: 85, w: 190, fontSize: 10, h: 10 }])
      recordCellLines(row[1], [{ x: 220, y: 100, w: 60, fontSize: 10, h: 10 }, { x: 220, y: 85, w: 60, fontSize: 10, h: 10 }])
    }
  }
  return [a, b]
}
const joinedRows = ([a, b]: [IRTable, IRTable]) => joinSplitParts(a, [0, 200, 300], b, [0, 200, 300])!.table.rows

describe("쪽 경계의 연속 번호 행", () => {
  it("글줄이 꽉 차도 독립된 항목 네 행을 합치지 않는다", () => {
    assert.equal(joinedRows(parts()), 4)
  })
  it("숫자와 한글 번호도 같은 형식의 연속 행을 보존한다", () => {
    for (const marks of [["3)", "4)", "5)", "6)"], ["다.", "라.", "마.", "바."]]) assert.equal(joinedRows(parts(marks)), 4)
  })
  it("괘선이 없으면 번호 패턴만으로 실제 이어짐을 막지 않는다", () => {
    const p = parts()
    for (const t of p) ROW_RULES.delete(t)
    assert.equal(joinedRows(p), 3)
  })
  it("번호가 건너뛰거나 형식이 바뀌면 연속행 증거로 쓰지 않는다", () => {
    assert.equal(joinedRows(parts(["③", "④", "⑤", "⑦"])), 3)
    assert.equal(joinedRows(parts(["③", "④", "⑤", "6)"])), 3)
  })
  it("증거행이 부족하거나 한 칸에 번호가 여럿이면 기존 이어짐을 유지한다", () => {
    assert.equal(joinedRows(parts(["④", "⑤", "⑥"])), 2)
    const p = parts()
    p[0].cells[1][0].text += "\n① 칸 안 세부 목록"
    assert.equal(joinedRows(p), 3)
  })
  it("옆 열의 빈칸이나 병합칸은 독립된 완성행 증거가 아니다", () => {
    for (const merged of [false, true]) {
      const p = parts()
      if (merged) p[0].cells[0][1].rowSpan = 2
      else p[0].cells[0][1].text = ""
      assert.equal(joinedRows(p), 3)
    }
  })
})
