import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { mergeContinuedCells } from "../src/pdf/cell-continuation.js"
import { CLIP_TABLES, CONT_PARTS, EMPTY_PARTS, IMAGE_CELLS, TABLE_COLXS } from "../src/pdf/table-meta.js"
import type { IRBlock, IRTable } from "../src/types.js"

const table = (text = ""): IRTable => ({ rows: 1, cols: 1, hasHeader: false, cells: [[{ text, rowSpan: 1, colSpan: 1 }]] })

describe("쪽을 넘겨 이어 붙인 그림 칸", () => {
  it("행 조각을 합칠 때 뒤 조각의 그림 표시를 새 칸에 옮긴다", () => {
    const prev = table(), curr = table()
    prev.cols = curr.cols = 2
    prev.cells[0].push({ text: "설명\n1) 첫 항목", rowSpan: 1, colSpan: 1 })
    curr.cells[0].push({ text: "2) 다음 항목", rowSpan: 1, colSpan: 1 })
    IMAGE_CELLS.add(curr.cells[0][0])
    const result = joinSplitParts(prev, [0, 100, 200], curr, [0, 100, 200])!
    assert.equal(result.table.rows, 1)
    assert.equal(result.table.cells[0][0].text, "")
    assert.equal(result.table.cells[0][1].text, "설명\n1) 첫 항목\n2) 다음 항목")
    assert.ok(IMAGE_CELLS.has(result.table.cells[0][0]))
  })

  for (const image of [true, false]) it("단일 칸 이어짐에서 " + (image ? "그림만 있어도 빈 표가 아니다" : "실제로 빈 표는 빈 표시를 유지한다"), () => {
    const prev = table(), curr = table()
    EMPTY_PARTS.add(prev)
    if (image) IMAGE_CELLS.add(curr.cells[0][0])
    CONT_PARTS.set(curr, { x1: 0, x2: 100 })
    const blocks: IRBlock[] = [{ type: "table", table: prev, pageNumber: 1 }, { type: "table", table: curr, pageNumber: 2 }]
    mergeContinuedCells(blocks)
    assert.equal(blocks.length, 1)
    assert.equal(IMAGE_CELLS.has(prev.cells[0][0]), image)
    assert.equal(EMPTY_PARTS.has(prev), !image)
  })
})

for (const targetImage of [false, true]) it("중첩 이어짐: " + (targetImage ? "그림이 이미 있는 칸을 덮어쓰지 않는다" : "뒤 조각 그림을 빈 칸에 보존한다"), () => {
  const nested = table("머리")
  nested.cells.push([{ text: "", rowSpan: 1, colSpan: 1 }])
  nested.rows = 2
  const fragment = table(targetImage ? "새 상자" : "")
  for (const t of [nested, fragment]) { CLIP_TABLES.add(t); TABLE_COLXS.set(t, [10, 90]) }
  if (targetImage) IMAGE_CELLS.add(nested.cells[1][0])
  else IMAGE_CELLS.add(fragment.cells[0][0])
  const outer = table(), part = table()
  outer.cells[0][0].blocks = [{ type: "table", table: nested, pageNumber: 1 }]
  part.cells[0][0].blocks = [{ type: "table", table: fragment, pageNumber: 2 }]
  CONT_PARTS.set(part, { x1: 0, x2: 100 })
  const blocks: IRBlock[] = [{ type: "table", table: outer, pageNumber: 1 }, { type: "table", table: part, pageNumber: 2 }]
  mergeContinuedCells(blocks)
  const inner = outer.cells[0][0].blocks!
  assert.equal(inner.length, targetImage ? 2 : 1)
  assert.equal(nested.cells[1][0].text, "")
  assert.ok(IMAGE_CELLS.has(nested.cells[1][0]))
})
