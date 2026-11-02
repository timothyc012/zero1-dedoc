/** Selected-page conversion still needs nearby repetition proof for page margins. */
import type { IRBlock } from "../types.js"
import { normalizeItems, filterHiddenText, groupByY, mergeLineSimple, computeBBox, dominantStyle, type PdfTextItem } from "./text-line.js"

/** At most eight unselected neighbors per requested page, including alternating heads at either document edge. */
export function selectionContextPages(selected: Set<number>, pageCount: number): number[] {
  const out = new Set<number>()
  for (const page of selected) {
    for (let distance = 1; distance <= 4; distance++) {
      for (const neighbor of [page - distance, page + distance]) {
        if (neighbor < 1 || neighbor > pageCount || selected.has(neighbor)) continue
        out.add(neighbor)
      }
    }
  }
  return [...out].sort((a, b) => a - b)
}

/** Lightweight context only: no graphics, tables, images, OCR, output or progress events. */
export function marginContextBlocks(raw: PdfTextItem[], page: number, view: number[]): IRBlock[] {
  const [x1, y1, x2, y2] = view
  const width = x2 - x1, height = y2 - y1
  const items = filterHiddenText(normalizeItems(raw), width, height, x1, y1).visible
  for (const item of items) { item.x -= x1; item.y -= y1 }
  return groupByY(items).flatMap(line => {
    const bbox = computeBBox(line, page)
    if (bbox.y + bbox.height < height * 0.88 && bbox.y > height * 0.12) return []
    return [{ type: "paragraph" as const, text: mergeLineSimple(line), pageNumber: page, bbox, style: dominantStyle(line) }]
  })
}
