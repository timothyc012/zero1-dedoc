import type { LineSegment, TableGrid } from "./line-types.js"

/** Shaded cell clips supply the omitted outer edges of an otherwise ruled table.
 * Require actual top/bottom rules and every internal divider through the body;
 * a header-only shade or white gaps between cells cannot create a table. */
export function closeShadedTableEdges(
  clipGrids: TableGrid[], horizontals: LineSegment[], verticals: LineSegment[], fillRects: TableGrid["bbox"][],
): { horizontals: LineSegment[]; verticals: LineSegment[]; restored: TableGrid["bbox"][] } {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5
  let hs = horizontals, vs = verticals
  const restored: TableGrid["bbox"][] = []
  for (const grid of clipGrids) {
    if (grid.clipParent || grid.rowYs.length !== 2 || grid.colXs.length < 3 || !grid.cells?.length
      || grid.cells.some(c => c.filler || c.rowSpan !== 1 || c.colSpan !== 1)) continue
    const { x1, x2, y1: mid, y2: top } = grid.bbox
    if (!grid.cells.every(c => fillRects.some(f => near(f.x1, c.bbox.x1) && near(f.x2, c.bbox.x2)
      && near(f.y1, c.bbox.y1) && near(f.y2, c.bbox.y2)))) continue
    const topRule = hs.find(h => near(h.y1, top) && near(h.x1, x1) && near(h.x2, x2))
    if (!topRule) continue
    const dividers = grid.colXs.slice(1, -1).map(x => vs.find(v => near(v.x1, x)
      && near(v.y2, top) && v.y1 <= mid - 6))
    if (dividers.some(v => !v)) continue
    const bottom = dividers[0]!.y1
    if (!dividers.every(v => near(v!.y1, bottom))) continue
    const bottomRule = hs.find(h => near(h.y1, bottom) && near(h.x1, x1) && near(h.x2, x2))
    if (!bottomRule) continue
    const missing = [x1, x2].filter(x => !vs.some(v => near(v.x1, x) && v.y1 <= bottom + 1.5 && v.y2 >= top - 1.5))
    if (!missing.length) continue
    restored.push({ x1, x2, y1: bottom, y2: top })
    vs = vs.concat(missing.map(x => ({ x1: x, x2: x, y1: bottom, y2: top, lineWidth: topRule.lineWidth })))
    if (!hs.some(h => near(h.y1, mid) && near(h.x1, x1) && near(h.x2, x2))) {
      hs = hs.concat({ x1, x2, y1: mid, y2: mid, lineWidth: topRule.lineWidth })
    }
  }
  return { horizontals: hs, verticals: vs, restored }
}

/** A restored inner table is processed before its independent surrounding frame. */
export function nestRestoredShadedGrids(grids: TableGrid[], restored: TableGrid["bbox"][], horizontals: LineSegment[], verticals: LineSegment[]): void {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5
  if (restored.length === 0) return
  const nested = new Set<TableGrid>()
  for (const grid of grids) {
    const b = grid.bbox
    if (!restored.some(r => near(r.x1, b.x1) && near(r.x2, b.x2) && near(r.y1, b.y1) && near(r.y2, b.y2))) continue
    if (grids.some(g => g !== grid && b.x1 - g.bbox.x1 >= .8 && g.bbox.x2 - b.x2 >= .8
      && b.y1 - g.bbox.y1 >= .8 && g.bbox.y2 - b.y2 >= .8)) {
      grid.lineNested = true
      nested.add(grid)
    }
  }
  for (const frame of grids) {
    const b = frame.bbox
    if (frame.lineNested || ![...nested].some(g => g.bbox.x1 > b.x1 && g.bbox.x2 < b.x2 && g.bbox.y1 > b.y1 && g.bbox.y2 < b.y2)) continue
    const fullH = horizontals.filter(h => near(h.x1, b.x1) && near(h.x2, b.x2) && h.y1 >= b.y1 - 1.5 && h.y1 <= b.y2 + 1.5)
    if (!fullH.some(h => near(h.y1, b.y1)) || !fullH.some(h => near(h.y1, b.y2))
      || fullH.some(h => h.y1 > b.y1 + 1.5 && h.y1 < b.y2 - 1.5)) continue
    const fullV = verticals.filter(v => v.y1 <= b.y1 + 1.5 && v.y2 >= b.y2 - 1.5 && v.x1 >= b.x1 - 1.5 && v.x1 <= b.x2 + 1.5)
    if (!fullV.some(v => near(v.x1, b.x1)) || !fullV.some(v => near(v.x1, b.x2))
      || fullV.some(v => v.x1 > b.x1 + 1.5 && v.x1 < b.x2 - 1.5)) continue
    frame.colXs = [b.x1, b.x2]
    frame.rowYs = [b.y2, b.y1]
  }
}
