import type { LineSegment, TableGrid } from "./line-types.js"
import { extractCells } from "./cell-extract.js"

/** A shaded heading inside a one-cell frame cannot consume an independently
 * ruled table's heading while the frame removes its body grid. Keep the same
 * parent and use the matching complete grid's cells; infer no new boundaries. */
export function extendNestedShadedHeaders(
  clipGrids: TableGrid[], lineGrids: TableGrid[], horizontals: LineSegment[], verticals: LineSegment[], fills: TableGrid["bbox"][],
): TableGrid[] {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5
  const contains = (a: TableGrid["bbox"], b: TableGrid["bbox"]) =>
    b.x1 >= a.x1 - 1.5 && b.x2 <= a.x2 + 1.5 && b.y1 >= a.y1 - 1.5 && b.y2 <= a.y2 + 1.5
  const extended: TableGrid[] = []
  for (let i = 0; i < clipGrids.length; i++) {
    const c = clipGrids[i], parent = c.clipParent
    if (!parent || c.rowYs.length !== 2 || c.colXs.length < 3 || !c.cells?.length
      || c.cells.some(cell => cell.filler || cell.rowSpan !== 1 || cell.colSpan !== 1)) continue
    if (!clipGrids.some(g => g.rowYs.length === 2 && g.colXs.length === 2
      && near(g.bbox.x1, parent.x1) && near(g.bbox.x2, parent.x2)
      && near(g.bbox.y1, parent.y1) && near(g.bbox.y2, parent.y2))) continue
    if (!c.cells.every(cell => fills.some(f => near(f.x1, cell.bbox.x1) && near(f.x2, cell.bbox.x2)
      && near(f.y1, cell.bbox.y1) && near(f.y2, cell.bbox.y2)))) continue
    const host = lineGrids.find(l => l.rowYs.length > 2 && l.colXs.length === c.colXs.length
      && c.colXs.every((x, k) => near(x, l.colXs[k])) && c.rowYs.every((y, k) => near(y, l.rowYs[k]))
      && contains(parent, l.bbox)
      && l.rowYs.every(y => horizontals.some(h => near(h.y1, y) && near(h.x1, l.bbox.x1) && near(h.x2, l.bbox.x2)))
      && l.colXs.every(x => verticals.some(v => near(v.x1, x) && v.y1 <= l.bbox.y1 + 1.5 && v.y2 >= l.bbox.y2 - 1.5))
      && !clipGrids.some(o => o !== c && !contains(o.bbox, l.bbox)
        && Math.min(o.bbox.x2, l.bbox.x2) > Math.max(o.bbox.x1, l.bbox.x1)
        && Math.min(o.bbox.y2, l.bbox.y2) > Math.max(o.bbox.y1, l.bbox.y1)))
    if (!host) continue
    const grid = { ...host, clipParent: parent, cells: extractCells(host, horizontals, verticals) }
    clipGrids[i] = grid
    extended.push(grid)
  }
  return extended
}
