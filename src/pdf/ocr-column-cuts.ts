/**
 * OCR 무괘선 표의 결합 열 복원 (cluster-detector.ts buildClusterTable 에서 씀).
 *
 * 머리행 상자 하나에 두 열이 붙어 읽히면("단 가수량") 열 수가 모자라 본문 값도 한 칸에 남는다("1,300  2").
 * 머리행 픽셀 빈 구간과 본문 두 행 이상의 숫자 분리 위치가 겹칠 때만 그 자리에서 열을 가른다.
 */

import type { ClusterItem } from "./cluster-detector.js"
import { ocrTextGaps } from "../ocr/text-gaps.js"

const OCR_NUMERIC_CELL = /^[+-]?\d+(?:[,.]\d+)*%?$/
export const OCR_GROUPED_NUMBER = /^[+-]?\d{1,3}(?:\s+\d{3})+(?:[.,]\d+)?%?$/

/** 머리행의 픽셀 빈 구간을 숫자 값이 갈린 서로 다른 본문 두 행 이상이 지지할 때만 열을 늘린다. */
export function supportedOcrColumnCuts(rows: Array<Array<{ col: number; items: ClusterItem[] }>>): Map<number, number> {
  const cuts = new Map<number, number>()
  for (const head of rows[0] ?? []) {
    if (head.items.length !== 1 || head.items[0].fontName !== "ocr") continue
    const candidates: number[] = []
    for (const gap of ocrTextGaps(head.items[0])) {
      const text = head.items[0].text
      if (!/\p{L}/u.test(text.slice(0, gap.at)) || !/\p{L}/u.test(text.slice(gap.at))) continue
      const intervals: Array<{ left: number; right: number }> = []
      for (const row of rows.slice(1)) {
        const cell = row.find(c => c.col === head.col)
        if (!cell || cell.items.some(it => it.fontName !== "ocr")) continue
        let interval: { left: number; right: number } | undefined
        if (cell.items.length === 1) {
          const it = cell.items[0]
          interval = ocrTextGaps(it).find(g => isOcrNumericSplit(it.text, g.at))
        } else if (isOcrNumericPair(cell.items)) {
          const [a, b] = [...cell.items].sort((a, b) => a.x - b.x)
          // OCR box의 여백·잡음은 겹칠 수 있다. 독립적으로 읽은 두 숫자는 각 중심의 양쪽에 둔다.
          interval = { left: a.x + a.w / 2, right: b.x + b.w / 2 }
        }
        if (interval) {
          const left = Math.max(gap.left, interval.left), right = Math.min(gap.right, interval.right)
          if (right > left) intervals.push({ left, right })
        }
      }
      // 서로 다른 행의 공통 빈 구간을 훑는다. 머리행 빈 구간의 가운데가 본문과 같을 필요는 없다.
      const events = intervals.flatMap(i => [{ x: i.left, delta: 1 }, { x: i.right, delta: -1 }]).sort((a, b) => a.x - b.x)
      let active = 0, bestCount = 1, bestWidth = 0, cut: number | undefined
      for (let i = 0; i < events.length;) {
        const x = events[i].x
        while (i < events.length && events[i].x === x) active += events[i++].delta
        const width = i < events.length ? events[i].x - x : 0
        if (active >= 2 && width > 0 && (active > bestCount || active === bestCount && width > bestWidth)) {
          bestCount = active; bestWidth = width; cut = x + width / 2
        }
      }
      if (cut !== undefined) candidates.push(cut)
    }
    if (candidates.length === 1) cuts.set(head.col, candidates[0])
  }
  return cuts
}

export function isOcrNumericPair(items: ClusterItem[]): boolean {
  return items.length === 2 && items.every(it => it.fontName === "ocr" && OCR_NUMERIC_CELL.test(it.text.trim())) &&
    !OCR_GROUPED_NUMBER.test([...items].sort((a, b) => a.x - b.x).map(it => it.text.trim()).join(" "))
}

export function isOcrNumericSplit(text: string, at: number): boolean {
  return !OCR_GROUPED_NUMBER.test(text.trim()) && /\s/.test((text[at - 1] ?? "") + (text[at] ?? "")) &&
    OCR_NUMERIC_CELL.test(text.slice(0, at).trim()) && OCR_NUMERIC_CELL.test(text.slice(at).trim())
}
