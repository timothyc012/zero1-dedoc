/**
 * 쪽 옆 색인 탭 — 책자형 문서는 장·절 이름을 쪽 바깥 좌우 띠에 작게, 세로로 한 자씩 찍어 쪽마다 되풀이한다(행정업무운영 편람
 * "제1절"·"공·문·서"). 바탕쪽 장식이라 HWPX 본문엔 없다. 머리·바닥글 제거는 상하 띠만 보므로 여기서 좌우 띠를 본다:
 * 쪽 폭 바깥 12% 띠 안, 그 쪽 본문 글줄 영역(긴 글 블록 좌우 끝의 분위수) 바깥에 통째로 든 짧은 글(10자 이하)이 3쪽 이상, 등장 쪽 묶음
 * (5쪽 넘게 끊기면 새 묶음)의 첫~끝 구간 40% 이상 쪽에 되풀이되면 그 묶음에서 뺀다 — 절 탭 "제1절" 은 장마다 몇 쪽씩 몰려 나와 책 전체
 * 구간으로 재면 성기다(편람: 첫~끝 구간 기준으론 한 번도 안 걸렸다).
 * 상자에 든 단원 탭(응급의료기관 평가 기준집 홀수 쪽 "필수영역"·"필수 7"·"시⏎설⏎의⏎적⏎절⏎운⏎용")은 괘선 1열 표로 읽힌다 — 글이 단원마다
 * 바뀌어 글 되풀이로는 못 잡으니 자리(같은 띠·같은 x)가 되풀이되면 뺀다 (#112)
 */

import type { IRBlock, IRTable } from "../types.js"

const BAND = 0.12
const MAX_CHARS = 10
const MIN_REPEAT = 3
/** 등장 쪽 묶음 — 이보다 멀리 끊기면 새 묶음. 격쪽(짝·홀수 쪽만) 탭은 등장 간격 중앙값의 3배까지 — 간지 두 쪽이 끼면 간격 6 이라
 *  앞 두 쪽이 3쪽 미만 묶음으로 떨어져 남았다(응급의료기관 평가 기준집 60·62쪽 | 68쪽~) */
const RUN_GAP = 5
/** 단원 탭 표 — 칸 글 상한, 쪽 높이 대비 최소 높이 */
const TAB_CELL_CHARS = 24
const TAB_MIN_HEIGHT = 0.3

/** 쪽 옆 띠의 단원 탭 표 (isSideTabTable) — 틀 칸에 중첩시키지 않고 쪽 블록으로 두어 여기서 자리 되풀이로 뺀다 */
export const SIDE_TAB_TABLES = new WeakSet<IRTable>()

/**
 * 단원 탭 표 — 쪽 바깥 12% 띠 안의 좁고(띠 폭 이하) 긴(쪽 높이 30% 이상) 1열 표, 칸 글이 짧고, 표와 높이가 겹치는 다른 글이 모두
 * 안쪽에 있다. 쪽 전체 틀 칸에 중첩되면 틀 칸 조립이 이 표의 위쪽 끝으로 글을 갈라, 옆 본문 첫 줄들이 본문 표들보다 앞에 몰려 나왔다
 */
export function isSideTabTable(box: { x1: number; y1: number; x2: number; y2: number }, table: IRTable,
  others: Array<{ x: number; y: number; w: number }>, pageWidth: number, pageHeight: number): boolean {
  if (table.cols !== 1 || box.x2 - box.x1 > pageWidth * BAND || box.y2 - box.y1 < pageHeight * TAB_MIN_HEIGHT) return false
  const side = box.x1 >= pageWidth * (1 - BAND) ? "R" : box.x2 <= pageWidth * BAND ? "L" : null
  if (!side) return false
  const texts = table.cells.flat().map(c => c.text.replace(/\s+/g, ""))
  if (!texts.some(Boolean) || texts.some(t => [...t].length > TAB_CELL_CHARS)) return false
  const overlap = others.filter(it => it.y >= box.y1 && it.y <= box.y2)
  return overlap.length > 0 && overlap.every(it => side === "R" ? it.x + it.w <= box.x1 + 1 : it.x >= box.x2 - 1)
}

export function removeSideTabs(blocks: IRBlock[], pageWidths: Map<number, number>): IRBlock[] {
  // 쪽마다 본문 글줄 영역(긴 글 블록의 좌우 끝) — 탭은 그 바깥에 선다. 두 단 왼단 첫머리 짧은 줄("따라서")은 본문 왼끝에 붙어 있다
  // 극값이 아니라 분위수(왼끝 20%·오른끝 80%) — 쪽마다 한둘 튀어나온 넓은 블록(그림 캡션)에 본문 끝이 부풀지 않게
  const edges = new Map<number, { lefts: number[]; rights: number[] }>()
  for (const b of blocks) {
    if (!b.bbox || b.pageNumber === undefined || [...(b.text?.trim() ?? "")].length <= MAX_CHARS) continue
    const e = edges.get(b.pageNumber) ?? { lefts: [], rights: [] }
    e.lefts.push(b.bbox.x); e.rights.push(b.bbox.x + b.bbox.width)
    edges.set(b.pageNumber, e)
  }
  const q = (xs: number[], p: number) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(p * v.length))] }
  const body = new Map<number, { left: number; right: number }>()
  for (const [page, e] of edges) body.set(page, { left: q(e.lefts, 0.2), right: q(e.rights, 0.8) })
  // 긴 글 블록이 없는 쪽(표·그림만)은 문서의 쪽별 본문 끝 중앙값으로
  const all = [...body.values()]
  const fallback = all.length ? { left: q(all.map(e => e.left), 0.5), right: q(all.map(e => e.right), 0.5) } : undefined
  const key = (b: IRBlock): string | null => {
    const w = b.pageNumber !== undefined ? pageWidths.get(b.pageNumber) : undefined
    const text = b.text?.trim()
    const area = (b.pageNumber !== undefined ? body.get(b.pageNumber) : undefined) ?? fallback
    if (b.type === "table") {
      // 단원 탭 표는 글 대신 자리(띠·x)로 — 단원마다 글이 바뀐다
      if (!w || !b.bbox || !b.table || !SIDE_TAB_TABLES.has(b.table)) return null
      return `\u0001${b.bbox.x >= w * (1 - BAND) ? "R" : "L"}${Math.round(b.bbox.x / 8)}`
    }
    if (!w || !area || !b.bbox || !text || [...text].length > MAX_CHARS) return null
    const side = b.bbox.x + b.bbox.width <= Math.min(w * BAND, area.left - 1) ? "L" : b.bbox.x >= Math.max(w * (1 - BAND), area.right + 1) ? "R" : null
    return side && `${side}\u0000${text.replace(/\s+/g, "")}`
  }
  const pages = new Map<string, Set<number>>()
  for (const b of blocks) {
    const k = key(b)
    if (k) pages.set(k, (pages.get(k) ?? new Set()).add(b.pageNumber!))
  }
  /** 탭으로 볼 (글, 쪽) — 묶음마다 따로 잰다 */
  const running = new Set<string>()
  for (const [k, ps] of pages) {
    const list = [...ps].sort((a, b) => a - b)
    const steps = list.slice(1).map((p, i) => p - list[i]).sort((a, b) => a - b)
    const gap = Math.max(RUN_GAP, (steps[steps.length >> 1] ?? 1) * 3)
    let run: number[] = []
    const flush = () => {
      if (run.length >= MIN_REPEAT && run.length >= (run[run.length - 1] - run[0] + 1) * 0.4) for (const p of run) running.add(`${p}\u0000${k}`)
      run = []
    }
    for (const p of list) { if (run.length && p - run[run.length - 1] > gap) flush(); run.push(p) }
    flush()
  }
  return running.size ? blocks.filter(b => { const k = key(b); return !k || !running.has(`${b.pageNumber}\u0000${k}`) }) : blocks
}
