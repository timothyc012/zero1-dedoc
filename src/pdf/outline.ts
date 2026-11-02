import type { IRBlock, OutlineItem } from "../types.js"

/** 최종 읽기 순서의 제목을 모은다. 틀을 유지한 경우에도 칸 안 제목을 포함한다. */
export function collectPdfOutline(blocks: IRBlock[]): OutlineItem[] {
  const outline: OutlineItem[] = []
  const visit = (bs: IRBlock[]): void => {
    for (const b of bs) {
      if (b.type === "heading" && b.level && b.text) outline.push({ level: b.level, text: b.text, pageNumber: b.pageNumber })
      if (b.type === "table" && b.table) for (const row of b.table.cells) for (const cell of row) {
        if (cell.blocks) visit(cell.blocks)
      }
    }
  }
  visit(blocks)
  return outline
}
