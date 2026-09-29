import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { extractCells } from "../src/pdf/cell-extract.js"
import type { LineSegment, TableGrid, TextItem } from "../src/pdf/line-types.js"

describe("extractCells — unruled numeric totals in an established table", () => {
  const colXs = [0, 100, 200, 300, 400, 500, 600, 700]
  const rowYs = [100, 90, 80, 70, 60]
  const grid: TableGrid = { colXs, rowYs, bbox: { x1: 0, x2: 700, y1: 60, y2: 100 }, vertexRadius: 1 }
  const horizontals: LineSegment[] = rowYs.map(y => ({ x1: 0, x2: 700, y1: y, y2: y, lineWidth: 1 }))
  const verticals: LineSegment[] = colXs.map(x => ({ x1: x, x2: x, y1: 80, y2: 100, lineWidth: 1 }))
  const item = (text: string, col: number, y: number): TextItem => ({
    text, x: col * 100 + 4, y, w: 70, h: 6, fontSize: 6, fontName: "Test",
  })
  const heading = item("Customs", 0, 71)
  const totals = ["Total", "590.293", "529.521", "11,5", "4.005.606", "3.868.988", "3,5"]
    .map((text, col) => item(text, col, 61))

  it("splits a numeric total into established columns but leaves a one-cell heading merged", () => {
    const cells = extractCells(grid, horizontals, verticals, [heading, ...totals])
    assert.deepEqual(cells.filter(c => c.row === 2).map(c => c.colSpan), [7])
    assert.deepEqual(cells.filter(c => c.row === 3).map(c => [c.col, c.colSpan]),
      colXs.slice(0, -1).map((_, col) => [col, 1]))
  })

  it("keeps a sparse full-width note merged", () => {
    const cells = extractCells(grid, horizontals, verticals, [heading, item("Footnote", 0, 61), item("12", 1, 61)])
    assert.deepEqual(cells.filter(c => c.row === 3).map(c => c.colSpan), [7])
  })
})
