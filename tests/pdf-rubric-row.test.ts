import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { FILLER_CELLS, ROW_RULES } from "../src/pdf/table-meta.js"
import type { IRCell, IRTable } from "../src/types.js"

const cell = (text: string): IRCell => ({ text, rowSpan: 1, colSpan: 1 })
function split(variant = "same"): IRTable {
  const prev: IRTable = { rows: 2, cols: 3, hasHeader: false, cells: [
    [cell("평가 하나"), cell("1) 공통 평가 기준\nA. 충분함\nB. 일부 충족\nC. 해당 없음"), cell("8\n3\n0")],
    [cell("평가 둘"), cell("A. 두 가지 요건을\n모두 충족함"), cell("8")],
  ] }
  const blank = cell("")
  FILLER_CELLS.add(blank)
  const curr: IRTable = { rows: 1, cols: 3, hasHeader: false,
    cells: [[blank, cell("B. 한 가지 요건만 충족함\nC. 해당 없음"), cell("3\n0")]] }
  if (variant === "different-tail") prev.cells[0][1].text = "A. 충분함\nB. 일부 충족\nC. 평가 제외"
  if (variant === "different-score") prev.cells[0][2].text = "8\n4\n0"
  if (variant === "skipped-item") curr.cells[0][1].text = "B. 한 가지 요건만 충족함\nD. 해당 없음"
  if (variant === "missing-score") curr.cells[0][2].text = "3"
  if (variant === "no-witness") prev.cells[0][1].text = "설명"
  if (variant === "spanning-witness") prev.cells[0][2].rowSpan = 2
  if (variant === "new-label") curr.cells[0][0] = cell("평가 셋")
  if (variant === "new-value") curr.cells[0][2].text = "등급 3\n등급 0"
  if (variant === "nested-witness") prev.cells[0][1].blocks = [{ type: "paragraph", text: "추가 설명" }]
  if (variant === "score-distribution") { prev.cells[1][2].text = "8\n3"; curr.cells[0][2].text = "0" }
  if (variant === "wide" || variant === "different-span") {
    prev.cols = curr.cols = 4
    for (const row of [...prev.cells, ...curr.cells]) { row[1].colSpan = 2; row.splice(2, 0, cell("")) }
    if (variant === "different-span") prev.cells[0][1].colSpan = 1
  }
  for (const t of [prev, curr]) ROW_RULES.set(t, { top: true, bottom: true, innerRuled: 1, innerOpen: 0 })
  const xs = prev.cols === 4 ? [0, 60, 180, 300, 340] : [0, 60, 300, 340]
  return joinSplitParts(prev, xs, curr, xs, 0, 30)!.table
}

describe("평가 목록의 쪽 경계 — 같은 표의 완성행 증거", () => {
  it("이어진 분류칸과 번호·점수·마지막 항목이 같은 완성행이 있으면 합친다", () => {
    const table = split()
    assert.equal(table.rows, 2)
    assert.equal(table.cells[1][0].text, "평가 둘")
    assert.equal(table.cells[1][1].text, "A. 두 가지 요건을\n모두 충족함\nB. 한 가지 요건만 충족함\nC. 해당 없음")
    assert.equal(table.cells[1][2].text, "8\n3\n0")
  })
  it("본문이 두 열을 덮는 실제 평가표에서도 완성행을 찾는다", () => {
    const t = split("wide")
    assert.equal(t.rows, 2)
    assert.equal(t.cells[1][1].colSpan, 2)
    assert.equal(t.cells[1][3].text, "8\n3\n0")
  })
  for (const variant of ["different-span", "score-distribution", "different-tail", "different-score", "skipped-item", "missing-score", "no-witness", "spanning-witness", "new-label", "new-value", "nested-witness"]) {
    it(variant + "는 병합 근거가 아니다", () => assert.equal(split(variant).rows, 3))
  }
})
