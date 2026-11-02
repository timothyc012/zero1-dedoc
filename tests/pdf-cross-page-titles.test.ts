import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mergeCrossPageTables } from "../src/pdf/table-parts.js"
import { CLIP_TABLES, TABLE_COLXS, TABLE_ROWYS } from "../src/pdf/table-meta.js"
import type { IRBlock, IRCell, IRTable } from "../src/types.js"

function titleBox(title: string, page: number): IRBlock {
  const cells: IRCell[][] = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ text: "", colSpan: 1, rowSpan: 1 })))
  cells[0][1] = { text: title, colSpan: 1, rowSpan: 2 }
  cells[2][0] = { text: `본문 ${page}`, colSpan: 3, rowSpan: 1 }
  const table: IRTable = { rows: 3, cols: 3, cells, hasHeader: true }
  CLIP_TABLES.add(table)
  TABLE_COLXS.set(table, [62, 219, 376, 533])
  TABLE_ROWYS.set(table, [783, 761, 740, 60])
  return { type: "table", table, pageNumber: page, bbox: { page, x: 62, y: 60, width: 471, height: 723 } }
}

describe("쪽마다 새로 시작하는 클립 표 제목", () => {
  it("틀이 같아도 제목이 다르면 독립된 표로 보존한다", () => {
    const blocks = [titleBox("일러두기", 1), titleBox("목차", 2)]
    mergeCrossPageTables(blocks, new Map([[1, 841], [2, 841]]))
    assert.equal(blocks.length, 2)
    assert.deepEqual(blocks.map(b => b.table!.rows), [3, 3])
  })
  it("같은 제목을 반복한 이어짐은 여전히 한 표로 잇는다", () => {
    const blocks = [titleBox("조사 내용", 1), titleBox("조사 내용", 2)]
    mergeCrossPageTables(blocks, new Map([[1, 841], [2, 841]]))
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].table!.rows, 4)
    assert.equal(blocks[0].table!.cells[3][0].text, "본문 2")
  })
  it("다음 조각에 머리 글이 없으면 새 제목으로 보지 않는다", () => {
    const blocks = [titleBox("조사 내용", 1), titleBox("", 2)]
    mergeCrossPageTables(blocks, new Map([[1, 841], [2, 841]]))
    assert.equal(blocks.length, 1)
  })
  it("세로 병합 분류 옆의 작품명과 설명은 새 제목이 아니라 계속되는 자료행이다", () => {
    const blocks = [1, 2].map(page => {
      const b = titleBox("장려상", page), t = b.table!
      t.cells[0][0] = { text: "장려상", colSpan: 1, rowSpan: 3 }
      for (let r = 0; r < 3; r++) {
        t.cells[r][1] = { text: `작품 ${page}-${r}`, colSpan: 1, rowSpan: 1 }
        t.cells[r][2] = { text: `설명 ${page}-${r}`, colSpan: 1, rowSpan: 1 }
        if (r > 0) t.cells[r][0] = { text: "", colSpan: 1, rowSpan: 1 }
      }
      return b
    })
    mergeCrossPageTables(blocks, new Map([[1, 841], [2, 841]]))
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].table!.rows, 6)
  })
})
