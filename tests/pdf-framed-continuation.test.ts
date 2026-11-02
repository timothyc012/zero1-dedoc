import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock, IRTable } from "../src/types.js"
import { mergeContinuedCells } from "../src/pdf/cell-continuation.js"
import { mergeCrossPageTables } from "../src/pdf/table-parts.js"
import { CLIP_TABLES, FILLER_CELLS, ROW_RULES, TABLE_COLXS } from "../src/pdf/table-meta.js"

const table = (rows: string[][]): IRTable => ({ rows: rows.length, cols: rows[0].length, hasHeader: false,
  cells: rows.map(row => row.map(text => ({ text, rowSpan: 1, colSpan: 1 }))) })
function fixture(split = true) {
  const prev = table([["항목", "내용"], ["앞쪽 설명", "공통 값"]])
  const next = table([[split ? "설명 나머지" : "새 항목", split ? "" : "새 값"], ["다음 행", "다음 값"]])
  const wrapper = table([[""]])
  const inner: IRBlock = { type: "table", table: next, pageNumber: 2, bbox: { page: 2, x: 10, y: 700, width: 200, height: 80 } }
  wrapper.cells[0][0].blocks = [inner]
  for (const t of [prev, next, wrapper]) CLIP_TABLES.add(t)
  for (const t of [prev, next]) TABLE_COLXS.set(t, [10, 110, 210])
  TABLE_COLXS.set(wrapper, [8, 212])
  if (split) {
    FILLER_CELLS.add(next.cells[0][1])
    ROW_RULES.set(prev, { top: true, bottom: false, innerRuled: 2, innerOpen: 0 })
    ROW_RULES.set(next, { top: false, bottom: true, innerRuled: 2, innerOpen: 0 })
  }
  const blocks: IRBlock[] = [
    { type: "table", table: prev, pageNumber: 1, bbox: { page: 1, x: 10, y: 40, width: 200, height: 80 } },
    { type: "table", table: wrapper, pageNumber: 2, bbox: { page: 2, x: 8, y: 698, width: 204, height: 84 } },
  ]
  const heights = new Map([[1, 842], [2, 842]])
  return { blocks, inner, next, wrapper, heights }
}
describe("다음 쪽 감싸개 안의 표 이어짐", () => {
  it("별도 칸 이어짐 표시가 없어도 행 분할이 확인된 표는 같은 깊이에서 잇는다", () => {
    const f = fixture()
    mergeContinuedCells(f.blocks, f.heights)
    assert.equal(f.blocks[1], f.inner)
    mergeCrossPageTables(f.blocks, f.heights)
    assert.equal(f.blocks.length, 1)
    assert.equal(f.blocks[0].table!.rows, 3)
    assert.equal(f.blocks[0].table!.cols, 2)
    assert.match(f.blocks[0].table!.cells[1][0].text, /앞쪽 설명\n설명 나머지/)
  })
  for (const change of ["독립 행", "다른 열 경계", "쪽 중간", "뒤 문단", "클립 아님"] as const) it(`${change}이면 감싸개를 보존한다`, () => {
    const f = fixture(change !== "독립 행")
    if (change === "다른 열 경계") TABLE_COLXS.set(f.next, [10, 120, 210])
    if (change === "쪽 중간") f.inner.bbox!.y = 300
    if (change === "뒤 문단") f.wrapper.cells[0][0].blocks!.push({ type: "paragraph", text: "설명" })
    if (change === "클립 아님") CLIP_TABLES.delete(f.wrapper)
    mergeContinuedCells(f.blocks, f.heights)
    assert.equal(f.blocks[1].table, f.wrapper)
  })
})
