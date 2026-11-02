import type { IRBlock } from "../types.js"
import { SIDE_TAB_CAP_GROUPS } from "./cluster-detector.js"
import { computeBBox, dominantStyle, groupByY, mergeLineSimple, type NormItem } from "./text-line.js"

/** 새로 분리한 탭만 기준선 글을 묶어 원본 머리 표지 뒤에 둔다. 기존 탭 앞배치는 유지한다. */
export function attachSideTabBlocks(tab: Set<NormItem>, body: IRBlock[], pageNum: number): IRBlock[] {
  const ordered = [...tab].sort((a, b) => b.y - a.y)
  const caps = SIDE_TAB_CAP_GROUPS.get(tab)
  const block = (items: NormItem[]): IRBlock => ({ type: "paragraph", text: mergeLineSimple(items).trim(),
    pageNumber: pageNum, bbox: computeBBox(items, pageNum), style: dominantStyle(items) })
  const prefix: IRBlock[] = ordered.filter(g => !caps?.has(g)).map(g => ({ type: "paragraph", text: g.text.trim(),
    pageNumber: pageNum, bbox: computeBBox([g], pageNum), style: dominantStyle([g]) }))
  const groups = new Map<Pick<NormItem, "x" | "y" | "w" | "fontSize">, NormItem[]>()
  for (const g of ordered) {
    const cap = caps?.get(g)
    if (cap) groups.set(cap, [...(groups.get(cap) ?? []), g])
  }
  for (const [cap, glyphs] of groups) {
    const blocks = groupByY(glyphs).map(block)
    const anchor = body.reduce((best, b, i) => {
      const box = b.bbox
      if (b.type === "image" || b.type === "separator" || !box || !b.text && !b.table ||
          box.x > cap.x + 1 || box.x + box.width < cap.x + cap.w - 1 ||
          box.y > cap.y + 1 || box.y + box.height < cap.y + cap.fontSize - 1) return best
      return best < 0 || box.width * box.height < body[best].bbox!.width * body[best].bbox!.height ? i : best
    }, -1)
    body.splice(anchor >= 0 ? anchor + 1 : body.length, 0, ...blocks)
  }
  return [...prefix, ...body]
}
