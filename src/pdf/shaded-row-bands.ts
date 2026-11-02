import type { LineSegment, TableGrid } from "./line-types.js"

/** 떨어진 음영 행 띠가 한 선 표의 일부인지 확인한다. 면적 대신 실제 괘선의 연속성을 사용한다. */
export function hasShadedRowBands(
  host: TableGrid, clips: TableGrid[], fills: TableGrid["bbox"][],
  verticals: LineSegment[], horizontals: LineSegment[],
): boolean {
  const tol = 1.5
  const near = (a: number, b: number) => Math.abs(a - b) <= tol
  const bands = clips.filter(c => Math.min(c.bbox.x2, host.bbox.x2) > Math.max(c.bbox.x1, host.bbox.x1)
    && Math.min(c.bbox.y2, host.bbox.y2) > Math.max(c.bbox.y1, host.bbox.y1))
  if (bands.length < 2 || host.colXs.length < 3) return false
  // 독립 표 사이의 빈 간격을 합치지 않는다. 실제 내부 세로 획이 표 전체를 이어야 한다.
  if (!host.colXs.slice(1, -1).every(x => verticals.some(v => !v.fromFill && near(v.x1, x)
    && v.y1 <= host.bbox.y1 + tol && v.y2 >= host.bbox.y2 - tol))) return false
  const covered = new Set<number>()
  for (const band of bands) {
    if (band.clipParent || !band.cells?.length || band.colXs.length !== host.colXs.length
      || !band.colXs.every((x, i) => near(x, host.colXs[i]))) return false
    const start = host.rowYs.findIndex(y => near(y, band.rowYs[0]))
    if (start < 0 || !band.rowYs.every((y, i) => near(y, host.rowYs[start + i]))) return false
    // 채움 외곽이 만든 가상 행 경계는 사용하지 않는다.
    if (!band.rowYs.every(y => horizontals.some(h => !h.fromFill && near(h.y1, y)
      && h.x1 <= host.bbox.x1 + tol && h.x2 >= host.bbox.x2 - tol))) return false
    if (band.cells.length !== (band.rowYs.length - 1) * (band.colXs.length - 1)
      || !band.cells.every(cell => !cell.filler && cell.rowSpan === 1 && cell.colSpan === 1
        && near(cell.bbox.x1, band.colXs[cell.col]) && near(cell.bbox.x2, band.colXs[cell.col + 1])
        && near(cell.bbox.y2, band.rowYs[cell.row]) && near(cell.bbox.y1, band.rowYs[cell.row + 1])
        && fills.some(f => near(f.x1, cell.bbox.x1) && near(f.x2, cell.bbox.x2)
          && near(f.y1, cell.bbox.y1) && near(f.y2, cell.bbox.y2)))) return false
    for (let i = 0; i < band.rowYs.length - 1; i++) {
      if (covered.has(start + i)) return false
      covered.add(start + i)
    }
  }
  // 모든 행에 클립이 있는 일반 셀 격자는 보존한다.
  return covered.size < host.rowYs.length - 1
}
