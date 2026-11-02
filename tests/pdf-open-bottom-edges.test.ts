import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { closeOpenTableEnds } from "../src/pdf/open-table-ends.js"
import { buildTableGrids, extractCells } from "../src/pdf/line-detector.js"
import { takeClipCellEdges } from "../src/pdf/cell-edges.js"
import { CELL_EDGES, CONTENT_CELLS, unframeLayoutTables } from "../src/table/layout-frames.js"
import type { IRCell, IRTable } from "../src/types.js"
import type { LineSegment } from "../src/pdf/line-types.js"

const h = (y: number, x1 = 50, x2 = 350): LineSegment => ({ x1, y1: y, x2, y2: y, lineWidth: 0.5 })
const v = (x: number, top: number): LineSegment => ({ x1: x, y1: 240, x2: x, y2: top, lineWidth: 0.5 })

function fixture(options: { bottom?: "closed" | "partial" | "tip" | "dashed" | "white"; openTop?: boolean; raw?: boolean; text?: string; image?: boolean; block?: boolean } = {}) {
  const horizontals = [300, 280, 260].map(y => h(y))
  const verticals = [50, 150, 250, 350].map(x => v(x, options.openTop ? 330 : 300))
  if (options.bottom === "closed") horizontals.push(h(240))
  if (options.bottom === "partial") horizontals.push(h(240, 50, 150))
  if (options.bottom === "tip") horizontals.push(h(240, 100, 105))
  const shortH: LineSegment[] = []
  if (options.bottom === "dashed") for (let x = 50; x < 350; x += 9) shortH.push(h(240, x, Math.min(x + 7, 350)))
  const white = h(240)
  const raw = {
    horizontals: [...horizontals, ...shortH, ...(options.bottom === "white" ? [white] : [])],
    verticals,
    nonRules: new Set(options.bottom === "white" ? [white] : []),
  }
  const closed = closeOpenTableEnds(horizontals, verticals, true, options.raw === false ? undefined : raw)
  const [grid] = buildTableGrids(closed, verticals)
  assert.ok(grid)
  const extracted = extractCells(grid, closed, verticals)
  const rows = grid.rowYs.length - 1, cols = grid.colXs.length - 1
  const cells: IRCell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: "", rowSpan: 1, colSpan: 1 })))
  for (const c of extracted) {
    const out = cells[c.row][c.col]
    Object.assign(out, { rowSpan: c.rowSpan, colSpan: c.colSpan, text: c.row === 0 ? `Header ${c.col}` : c.row === rows - 1 ? options.text ?? "" : "" })
    takeClipCellEdges(c, out)
    if (c.row === rows - 1 && c.col === 0) {
      if (options.image) CONTENT_CELLS.add(out)
      if (options.block) out.blocks = [{ type: "image", text: "figure.png" }]
    }
  }
  const table: IRTable = { rows, cols, cells, hasHeader: true }
  const result = unframeLayoutTables([{ type: "table", table }])
  assert.equal(result.length, 1)
  assert.ok(result[0].table)
  return { before: table, after: result[0].table }
}

describe("선 격자의 합성 밑변과 실제 빈 끝행", () => {
  it("앞 행은 실제 네 변이 닫히고 마지막 빈행만 밑변이 없으면 끝행을 접는다", () => {
    const { before, after } = fixture()
    assert.equal(before.rows, 3)
    assert.equal(CELL_EDGES.get(before.cells[2][0])?.b, false)
    assert.equal(after.rows, 2)
  })

  for (const bottom of ["closed", "partial", "tip", "dashed"] as const) {
    it(`실제 ${bottom} 밑변이 있으면 빈행을 보존한다`, () => {
      assert.equal(fixture({ bottom }).after.rows, 3)
    })
  }

  it("흰 선은 실제 테두리 증거로 사용하지 않는다", () => {
    assert.equal(fixture({ bottom: "white" }).after.rows, 2)
  })

  it("원시 선을 받지 않은 호출은 기존 선 격자를 유지한다", () => {
    const { before, after } = fixture({ raw: false })
    assert.equal(CELL_EDGES.has(before.cells[2][0]), false)
    assert.equal(after.rows, 3)
  })

  it("밑변이 없어도 합계 글이 있는 행을 보존한다", () => {
    const { after } = fixture({ text: "Total" })
    assert.equal(after.rows, 3)
    assert.equal(after.cells[2][0].text, "Total")
  })

  it("그림 표시가 있는 행을 보존한다", () => {
    const { before, after } = fixture({ image: true })
    assert.equal(after.rows, 3)
    assert.equal(after.cells[2][0], before.cells[2][0])
  })

  it("구조화 그림 블록이 있는 행을 보존한다", () => {
    const { after } = fixture({ block: true })
    assert.equal(after.rows, 3)
    assert.deepEqual(after.cells[2][0].blocks, [{ type: "image", text: "figure.png" }])
  })

  it("머리행 위도 열린 표는 기존 동작을 유지한다", () => {
    assert.equal(fixture({ openTop: true }).after.rows, 4)
  })
})
