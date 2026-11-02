import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRCell, IRTable } from "../src/types.js"
import { CELL_LINES } from "../src/pdf/table-meta.js"
import { matchesCompleteAlignedLabelListRow } from "../src/pdf/split-row-pattern.js"

const cell = (text: string, ys: number[] = [], rowSpan = 1): IRCell => {
  const c = { text, rowSpan, colSpan: 1 }
  if (ys.length) CELL_LINES.set(c, ys.map(y => ({ y, l: 100, r: 130, h: 10 })))
  return c
}
function fixture() {
  const peer = () => [cell("분류"), cell("항목"), cell("전문가:\n기사:\n기능사:", [100, 80, 60]), cell("가\n나\n다", [100, 80, 60]), cell("비고")]
  const table: IRTable = { rows: 4, cols: 5, hasHeader: false, cells: [peer(), peer(),
    [cell("분류", [], 2), cell("해양시설"), cell("전문가:", [40]), cell("해양", [40]), cell("비고", [], 2)],
    [cell(""), cell(""), cell("기사:\n기능사:", [700, 680]), cell("항해\n등대", [700, 680]), cell("")],
  ] }
  return table
}
function matches(table: IRTable) {
  type Owner = { r: number; c: number; rs: number; cs: number }
  const owner: (Owner | null)[][] = Array.from({ length: table.rows }, () => Array(table.cols).fill(null))
  for (let r = 0; r < table.rows; r++) for (let c = 0; c < table.cols; c++) {
    if (owner[r][c]) continue
    const x = table.cells[r][c], a = { r, c, rs: x.rowSpan, cs: x.colSpan }
    for (let dr = 0; dr < a.rs; dr++) for (let dc = 0; dc < a.cs; dc++) if (owner[r + dr] && c + dc < table.cols) owner[r + dr][c + dc] = a
  }
  return matchesCompleteAlignedLabelListRow(table, owner, 3)
}
describe("쪽 경계의 반복 라벨 목록과 값 열", () => {
  it("완성행의 같은 라벨 순서와 값 줄 정렬로 쪼개진 행을 확인한다", () => {
    assert.equal(matches(fixture()), true)
  })
  it("옆 문맥 열에 새 항목이 시작되면 합치지 않는다", () => {
    const t = fixture(); t.cells[3][1].text = "도시시설"
    assert.equal(matches(t), false)
  })
  it("라벨 순서가 다르면 합치지 않는다", () => {
    const t = fixture(); t.cells[3][2].text = "기능사:\n기사:"
    assert.equal(matches(t), false)
  })
  it("행·열 병합 범위가 다르면 합치지 않는다", () => {
    for (const attr of ["rowSpan", "colSpan"] as const) {
      const t = fixture(); t.cells[3][2][attr] = 2
      assert.equal(matches(t), false)
    }
  })
  it("라벨의 각 줄과 옆 값 줄이 정렬돼야 한다", () => {
    const t = fixture(); CELL_LINES.set(t.cells[3][3], [{ y: 698, l: 200, r: 230, h: 10 }, { y: 678, l: 200, r: 230, h: 10 }])
    assert.equal(matches(t), false)
  })
  it("같은 목록을 가진 독립 완성행 두 개가 필요하다", () => {
    const t = fixture(); t.cells[0][2].text = "전문가:\n다른기사:\n기능사:"
    assert.equal(matches(t), false)
  })
  it("여러 라벨 줄이 같은 값 줄을 중복해서 정렬 증거로 쓰지 않는다", () => {
    const t = fixture()
    CELL_LINES.set(t.cells[3][2], [700, 698].map(y => ({ y, l: 100, r: 130, h: 1 })))
    CELL_LINES.set(t.cells[3][3], [699, 500].map(y => ({ y, l: 200, r: 230, h: 1 })))
    assert.equal(matches(t), false)
  })
  it("옆 열의 쪽 경계 병합 증거가 없으면 합치지 않는다", () => {
    const t = fixture(); t.cells[2][0].rowSpan = t.cells[2][4].rowSpan = 1
    assert.equal(matches(t), false)
  })
  it("값을 문구로 추정하지 않고 원래 값을 유지한다", () => {
    const t = fixture(); t.cells[3][3].text = "새로운 값\n다른 값"
    assert.equal(matches(t), true)
    assert.equal(t.cells[3][3].text, "새로운 값\n다른 값")
  })
})
