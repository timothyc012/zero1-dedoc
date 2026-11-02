import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { dropShadingClipGrids } from "../src/pdf/table-grid.js"
import type { LineSegment, TableGrid } from "../src/pdf/line-types.js"

function fixture() {
  const host: TableGrid = {
    colXs: [0, 140, 200], rowYs: [200, 180, 140, 100, 70, 0],
    bbox: { x1: 0, y1: 0, x2: 200, y2: 200 }, vertexRadius: 1,
  }
  const band = (ys: number[]): TableGrid => ({
    ...host, rowYs: ys, bbox: { ...host.bbox, y1: ys.at(-1)!, y2: ys[0] },
    cells: ys.slice(1).flatMap((y, row) => [0, 1].map(col => ({
      row, col, rowSpan: 1, colSpan: 1,
      bbox: { x1: host.colXs[col], x2: host.colXs[col + 1], y1: y, y2: ys[row] },
    }))),
  })
  // 두 음영 띠의 합계가 본표의 65% — 사이와 아래에는 클립 없는 흰 행이 있다.
  const clips = [band([200, 180, 140]), band([70, 0])]
  const fills = clips.flatMap(c => c.cells!.map(cell => ({ ...cell.bbox })))
  const verticals: LineSegment[] = host.colXs.map(x => ({ x1: x, x2: x, y1: 0, y2: 200, lineWidth: 1 }))
  const horizontals: LineSegment[] = host.rowYs.map(y => ({ x1: 0, x2: 200, y1: y, y2: y, lineWidth: 1 }))
  return { host, clips, fills, verticals, horizontals, band }
}

describe("실제 괘선과 일치하는 여러 음영 행 띠", () => {
  it("면적이 절반을 넘어도 연속 선 표에 글을 맡긴다", () => {
    const { host, clips, fills, verticals, horizontals } = fixture()
    assert.deepEqual(dropShadingClipGrids(clips, [host], fills, verticals, horizontals), [])
  })

  for (const missing of ["vertical-bridge", "horizontal", "row", "columns", "shading", "white-row", "parent", "fill-edge", "filler", "overlap"] as const) {
    it(`별도 클립의 경계를 지울 근거가 없으면 보존한다: ${missing}`, () => {
      const f = fixture()
      if (missing === "vertical-bridge") f.verticals = f.verticals.flatMap(v => [
        { ...v, y1: 140 }, { ...v, y2: 70 },
      ])
      if (missing === "horizontal") f.horizontals = f.horizontals.filter(h => h.y1 !== 180)
      if (missing === "row") f.host.rowYs = f.host.rowYs.filter(y => y !== 180)
      if (missing === "columns") f.host.colXs = [0, 100, 140, 200]
      if (missing === "shading") f.fills.pop()
      if (missing === "white-row") {
        f.clips.push(f.band([140, 100, 70]))
        f.fills.push(...f.clips[2].cells!.map(c => c.bbox))
      }
      if (missing === "parent") f.clips[1].clipParent = { ...f.host.bbox }
      if (missing === "fill-edge") f.horizontals = f.horizontals.map(h => ({ ...h, fromFill: true }))
      if (missing === "filler") f.clips[0].cells![0].filler = true
      if (missing === "overlap") f.clips.push(structuredClone(f.clips[1]))
      assert.deepEqual(dropShadingClipGrids(f.clips, [f.host], f.fills, f.verticals, f.horizontals), f.clips)
    })
  }
})
