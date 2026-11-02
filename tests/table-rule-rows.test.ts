import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock, IRCell, IRTable } from "../src/types.js"
import { CELL_EDGES, unframeLayoutTables } from "../src/table/layout-frames.js"

const NONE = { t: false, b: false, l: false, r: false }
const BOX = { t: true, b: true, l: true, r: true }
const cell = (text = "", rowSpan = 1): IRCell => ({ text, rowSpan, colSpan: 1 })

/** Two product labels beside a narrow rule-only column. The middle box starts on
 * an otherwise empty row and spans the boundary between the two labels, as in
 * the official quota annex. Its top/bottom rule positions are not spacer text. */
function fixture(corner: boolean): { block: IRBlock; middle: IRCell } {
  const cells = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => cell()))
  cells[0] = [cell("품목"), cell(), cell("한계수량")]
  cells[1][0] = cell("카페인 미제거", 2)
  cells[1][2] = cell("수입 전량")
  cells[3][0] = cell("카페인 제거", 2)
  cells[2][1].rowSpan = 2
  for (const row of cells) for (const c of row) CELL_EDGES.set(c, NONE)
  for (const c of cells[0]) CELL_EDGES.set(c, BOX)
  CELL_EDGES.set(cells[1][1], { ...NONE, t: true, r: true })
  CELL_EDGES.set(cells[2][1], corner ? BOX : { ...NONE, r: true })
  CELL_EDGES.set(cells[4][1], { ...NONE, b: true, r: true })
  const table: IRTable = { rows: 5, cols: 3, cells, hasHeader: true }
  return { block: { type: "table", table }, middle: cells[2][1] }
}

describe("rule-only empty rows", () => {
  it("keeps an empty cell where horizontal and vertical rules meet", () => {
    const { block, middle } = fixture(true)
    const out = unframeLayoutTables([block], true)
    assert.ok(out.some(b => b.table?.cells.some(row => row.includes(middle))),
      "the shared-range bracket's middle cell must survive visual row folding")
    assert.equal(out.find(b => b.table)?.table?.rows, 4,
      "fold the empty row boundary without deleting its spanning corner cell")
    assert.equal(middle.rowSpan, 1)
    assert.deepEqual(CELL_EDGES.get(middle), BOX)
  })

  it("still folds an empty spacer carrying only a continuous vertical rule", () => {
    const { block, middle } = fixture(false)
    const out = unframeLayoutTables([block], true)
    assert.ok(!out.some(b => b.table?.cells.some(row => row.includes(middle))))
    assert.ok(out.some(b => b.table?.cells.flat().some(c => c.text === "카페인 제거")))
  })

  it("still folds a corner whose entire spanning range is empty", () => {
    const { block, middle } = fixture(true)
    block.table!.cells[3][0].text = ""
    const out = unframeLayoutTables([block], true)
    assert.ok(!out.some(b => b.table?.cells.some(row => row.includes(middle))))
  })

  for (const [name, rs, cs] of [["wide", 2, 2], ["tall", 3, 1]] as const) it(`still folds a ${name} merged decoration`, () => {
    const { block, middle } = fixture(true)
    middle.rowSpan = rs; middle.colSpan = cs
    if (rs === 3) block.table!.cells[4][2].text = "추가 수량"
    const out = unframeLayoutTables([block], true)
    assert.ok(!out.some(b => b.table?.cells.some(row => row.includes(middle))))
    assert.ok(out.some(b => b.table?.cells.flat().some(c => c.text === "카페인 제거")))
  })

  it("does not introduce row boundaries in otherwise covered wiring rows", () => {
    const cells = Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => cell()))
    cells[0][0] = cell("왼쪽 항목", 6); cells[0][2] = cell("오른쪽 항목", 6)
    cells[2][1].rowSpan = 2; cells[4][1].rowSpan = 2
    for (const row of cells) for (const c of row) CELL_EDGES.set(c, NONE)
    CELL_EDGES.set(cells[0][1], { ...NONE, t: true, r: true })
    CELL_EDGES.set(cells[1][1], { ...NONE, r: true })
    CELL_EDGES.set(cells[2][1], BOX)
    CELL_EDGES.set(cells[4][1], { ...NONE, b: true, r: true })
    const out = unframeLayoutTables([{ type: "table", table: { rows: 6, cols: 3, cells, hasHeader: false } }], true)
    assert.equal(out[0].table!.rows, 2)
    assert.ok(!out[0].table!.cells.some(row => row.includes(cells[2][1])))
  })

  it("still folds a vertically merged hidden-placeholder row", () => {
    const { block, middle } = fixture(true)
    middle.text = "소속관서"
    middle.blocks = [{ type: "paragraph", text: "소속관서", spans: [{ text: "소속관서", placeholder: true }] }]
    const out = unframeLayoutTables([block], true)
    assert.ok(!out.some(b => b.table?.cells.some(row => row.includes(middle))))
  })
})
