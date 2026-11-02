import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { CLIP_CELL_EDGES, recordClipCellEdges, takeClipCellEdges } from "../src/pdf/cell-edges.js"
import { unframeLayoutTables } from "../src/table/layout-frames.js"
import type { ExtractedCell, LineSegment, TableGrid } from "../src/pdf/line-types.js"
import type { IRCell } from "../src/types.js"

const box = { x1: 100, y1: 600, x2: 200, y2: 640 }
const parent = { x1: 95, y1: 598.5, x2: 201.5, y2: 641.5 }
const h = (y: number, lineWidth = 0.48): LineSegment => ({ x1: 95, y1: y, x2: 201.5, y2: y, lineWidth })
const v = (x: number, lineWidth = 0.48): LineSegment => ({ x1: x, y1: 598.5, x2: x, y2: 641.5, lineWidth })
const makeGrid = (clipParent: TableGrid["clipParent"] = parent): TableGrid => ({
  bbox: { ...box }, colXs: [100, 200], rowYs: [640, 600], vertexRadius: 1, clipParent,
  cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, bbox: { ...box } }],
})
function edges(grid: TableGrid, hs: LineSegment[], vs: LineSegment[] = []) {
  recordClipCellEdges([grid], hs, vs)
  return CLIP_CELL_EDGES.get(grid.cells![0])!
}

describe("부모 틀의 떨어진 획은 자식 표의 테두리가 아니다", () => {
  it("부모의 위·아래·오른변이 가까워도 자식까지 닿지 않으면 제외한다", () => {
    assert.deepEqual(edges(makeGrid(), [h(641.5), h(598.5)], [v(201.5)]), { t: false, b: false, l: false, r: false })
  })
  it("왼쪽 부모 변도 동일하게 구분한다", () => {
    assert.equal(edges(makeGrid({ ...parent, x1: 98.5 }), [], [v(98.5)]).l, false)
  })
  it("부모가 확인되지 않은 격자의 허용 거리는 유지한다", () => {
    const g = makeGrid(); delete g.clipParent
    assert.equal(edges(g, [h(641.5)]).t, true)
  })
  it("부모와 자식이 실제 같은 변을 공유하면 보존한다", () => {
    assert.equal(edges(makeGrid({ ...parent, y2: 640 }), [h(640)]).t, true)
  })
  it("부모의 굵은 획이 자식 변에 닿으면 보존한다", () => {
    assert.equal(edges(makeGrid(), [h(641.5, 3)]).t, true)
  })
  it("채움 선분의 저장 stroke 폭으로 실제 잉크 폭을 추측하지 않는다", () => {
    assert.equal(edges(makeGrid(), [{ ...h(641.5), fromFill: true }]).t, true)
  })
  it("자식 자체의 선은 보존한다", () => {
    assert.equal(edges(makeGrid(), [h(640), h(641.5)]).t, true)
  })
  it("부모 변이 아닌 셀 간격 선은 격자 밖에 조금 떨어져도 보존한다", () => {
    assert.equal(edges(makeGrid(), [h(640.8)]).t, true)
  })
  it("자식 격자 내부의 셀 간격 선은 보존한다", () => {
    const g = makeGrid()
    g.cells![0].bbox.y2 = 620
    assert.equal(edges(g, [h(621.5)]).t, true)
  })
  it("부모가 있는 격자를 처리해도 같은 선을 쓰는 이웃 격자를 바꾸지 않는다", () => {
    const child = makeGrid(), other = makeGrid(); delete other.clipParent
    recordClipCellEdges([child, other], [h(641.5)], [])
    assert.equal(CLIP_CELL_EDGES.get(child.cells![0])!.t, false)
    assert.equal(CLIP_CELL_EDGES.get(other.cells![0])!.t, true)
  })
  it("점선 틀 안 단위·주석은 문단으로 풀고 본문 표와 글은 보존한다", () => {
    const ys = [640, 630, 620, 610, 600], xs = [100, 150, 200]
    const cells: ExtractedCell[] = []
    const ir: IRCell[][] = []
    for (let r = 0; r < 4; r++) {
      ir.push([])
      for (let c = 0; c < 2; c++) ir[r].push({ text: "", rowSpan: 1, colSpan: 1 })
      for (let c = 0; c < 2; c++) {
        if ((r === 0 || r === 3) && c === 1) continue
        const cs = r === 0 || r === 3 ? 2 : 1
        cells.push({ row: r, col: c, rowSpan: 1, colSpan: cs, bbox: { x1: xs[c], x2: xs[c + cs], y1: ys[r + 1], y2: ys[r] } })
        ir[r][c] = { text: r === 0 ? "(단위: 명)" : r === 3 ? "* 잠정 통계" : `${r}:${c}`, rowSpan: 1, colSpan: cs }
      }
    }
    const g = { ...makeGrid(), cells, rowYs: ys, colXs: xs }
    const dots: LineSegment[] = []
    for (const y of [598.5, 641.5]) for (let x = 95; x < 201.5; x += 2) dots.push({ ...h(y), x1: x, x2: Math.min(x + 1, 201.5) })
    recordClipCellEdges([g], [...dots, ...[610, 620, 630].map(y => ({ ...h(y), x1: 100, x2: 200 }))],
      [v(201.5), ...xs.map(x => ({ ...v(x), y1: 610, y2: 630 }))])
    cells.forEach(c => takeClipCellEdges(c, ir[c.row][c.col]))
    const blocks = unframeLayoutTables([{ type: "table", table: { rows: 4, cols: 2, cells: ir, hasHeader: false } }])
    assert.deepEqual(blocks.map(b => b.type), ["paragraph", "table", "paragraph"])
    assert.equal(blocks[0].text, "(단위: 명)")
    assert.equal(blocks[2].text, "* 잠정 통계")
    assert.deepEqual(blocks[1].table!.cells.map(row => row.map(c => c.text)), [["1:0", "1:1"], ["2:0", "2:1"]])
  })
})
