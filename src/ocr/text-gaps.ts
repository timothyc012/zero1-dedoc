import { grayCrop, inkStats } from "./line-split.js"
import type { Box } from "./crop.js"

/** at는 UTF-16 문자열 위치, left/right는 현재 좌표계의 x 구간이다. */
export interface OcrTextGap { at: number; left: number; right: number }

const evidence = new WeakMap<object, { text: string; gaps: OcrTextGap[] }>()
const NO_GAPS: OcrTextGap[] = []

export function rememberOcrTextGaps(item: { text: string }, gaps: OcrTextGap[]): void {
  if (gaps.length) evidence.set(item, { text: item.text, gaps })
}

export function ocrTextGaps(item: { text: string }): OcrTextGap[] {
  const saved = evidence.get(item)
  return saved?.text === item.text ? saved.gaps : NO_GAPS
}

export function copyOcrTextGaps(source: { text: string }, target: { text: string }, scale = 1, offsetX = 0): void {
  const gaps = ocrTextGaps(source)
  if (!gaps.length || source.text !== target.text) return
  rememberOcrTextGaps(target, scale === 1 && offsetX === 0 ? gaps : gaps.map(g => ({ ...g, left: g.left * scale + offsetX, right: g.right * scale + offsetX })))
}

/** CTC 위치로 이웃 글자를 찾고, 실제 pixel의 빈 구간만 분리 근거로 보존한다. */
export function findOcrTextGaps(rgba: Uint8Array, pageW: number, box: Box, read: string, text: string, steps: number[], stepPx: number): OcrTextGap[] {
  if (read.replace(/\s/g, "") !== text.replace(/\s/g, "") || [...read].length !== steps.length) return []
  const visible = [...read].flatMap((c, i) => /\s/.test(c) ? [] : [(steps[i] + 0.5) * stepPx])
  if (visible.length < 2) return []
  const gray = grayCrop(rgba, pageW, box), ink = inkStats(gray)
  if (!ink.darkInk || ink.contrast < 35) return []
  const counts = new Uint32Array(box.w)
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) if (gray[y * box.w + x] <= ink.threshold) counts[x]++
  const out: OcrTextGap[] = []
  let offset = 0, index = 0
  for (const c of text) {
    if (!/\s/.test(c)) {
      if (index > 0) {
        const from = Math.max(0, Math.floor(visible[index - 1]) + 1), end = Math.min(box.w, Math.ceil(visible[index]))
        let start = from, left = from, right = from
        for (let x = from; x <= end; x++) {
          if (x === end || counts[x] > Math.max(1, Math.floor(box.h * 0.03))) {
            if (x - start > right - left) { left = start; right = x }
            start = x + 1
          }
        }
        if (right - left >= Math.max(3, box.h * 0.25)) out.push({ at: offset, left: box.x + left, right: box.x + right })
      }
      index++
    }
    offset += c.length
  }
  return out
}
