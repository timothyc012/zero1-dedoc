/**
 * 한컴 칸 클립 격자 표의 보이는 변 — 보이지 않는 틀 표 풀기(table/layout-frames, v4.17.0)의 PDF 쪽 곁정보.
 *
 * 한컴 PDF 는 테두리 "없음" 칸에도 칸마다 클립(`W n`)을 깔아 kordoc 이 틀 표를 그대로 표로 복원한다(clip-cells) — 할부거래법
 * 시행령 [별표 1] 은 원본 그림이 글과 분수뿐인데 5열 표가 됐다. 한컴은 보이는 칸 테두리만 칸 경계 좌표 그대로 선(획)으로 긋는다
 * (같은 문서 분수 막대 236.39~316.15 @659.52 = 분자 칸 클립 236.51~315.91 밑변 ±0.12, 대기환경보전법 시행령 [별표 8] 표 괘선도
 * 칸 클립 변과 같은 좌표). 그래서 칸 사각형 네 변 자리에 실제로 그은 선이 변 길이의 대부분을 덮으면 보이는 변이다.
 *
 * 선은 line-extract 가 모은 추출 선만 본다 — 획과 가는(≤1.5pt) 채움 사각형 괘선, 칸 높이가 낮아 MIN_LINE_LENGTH 밑으로 버려지는
 * 짧은 조각까지. 불투명도 0 획은 line-extract 가 이미 뺐고, 흰 선(흰 바탕에 안 보임)·두꺼운 채움 영역의 윤곽(칸 음영)은 nonRules 로
 * 따로 받아 뺀다. kordoc 이 합성한 가상 테두리(개방 변 합성 open-table-ends·closeOpenTableEdges)는 이 선들 뒤에 더해지므로 들어오지 않는다.
 * 같은 문서 HWP·HWPX 의 칸 테두리(borderFill)와 대조: 모양이 같은 표끼리 단위 격자 선분(맞닿은 두 칸 변 합침)의 보임 여부가 법령 별표
 * 236쌍 25,625개 중 99.95%, 표 정답 세트(보도자료·rhwp) 5,365쌍 435,737개 중 99.73% 같다. 어긋남은 대부분 PDF 에만 보이는 선이다 —
 * 표 자체 테두리(hp:tbl borderFillIDRef, 칸 테두리 밖에 그려짐)와 맞닿은 다른 표의 테두리.
 *
 * 기본적으로 클립 격자(TableGrid.cells)의 칸에 기록한다. 일반 선 격자·클러스터(무괘선)·booktabs·글상자 표는 그대로 둔다.
 * 예외는 원시 획으로 앞 행의 네 변과 마지막 행의 열린 밑변을 확인한 합성 끝선 격자뿐이다(recordOpenEndCellEdges).
 * 다른 제작기도 글마다 클립을 깔 수 있어, 클립 표의 틀 풀기는 한컴 PDF에서만 한다(parser.ts isHancomPdf).
 */

import type { IRCell } from "../types.js"
import { CELL_EDGES, type Edges } from "../table/layout-frames.js"
import type { ExtractedCell, LineSegment, TableGrid } from "./line-types.js"

/** 기하가 확인된 추출 칸 → 보이는 변 (page-blocks가 IR 칸의 CELL_EDGES로 옮긴다) */
export const CLIP_CELL_EDGES = new WeakMap<ExtractedCell, Edges>()

/** 합성 끝선을 만들기 전의 원시 획 — 짧은 점선 조각과 보이지 않는 선 정보도 포함한다. */
export interface RawCellRules {
  horizontals: ReadonlyArray<LineSegment>
  verticals: ReadonlyArray<LineSegment>
  nonRules?: ReadonlySet<LineSegment>
}
export const OPEN_END_RULES = new WeakMap<LineSegment, RawCellRules>()

/** 보이는 변이 하나도 없는 칸 — 클립 없던 자리를 메운 칸·표 위 단위 줄처럼 자기 테두리가 없는 칸 (이웃 칸 변이 선을 댄다) */
export const NO_EDGES: Readonly<Edges> = Object.freeze({ t: false, b: false, l: false, r: false })

/** 선이 변 자리에 있다고 보는 거리 (pt) — 한컴은 칸 경계 좌표에 긋는다(0.01pt 안). 셀 간격 표는 괘선 틈을 닫은 좌표(clip-cells
 *  closeGaps: 틈 가운데·괘선 쪽 끝, 틈 3pt 이하)라 괘선이 1.5pt 안에 있다. 칸 안 글 밑줄(기준선 아래)은 칸 밑변에서 이보다 멀다 */
const EDGE_NEAR = 1.6
/** 보이는 변 — 변 자리 선이 변 길이의 이 비율 이상을 덮고, 덮이지 않은 길이가 EDGE_SLACK 이하여야 한다. 한컴은 보이는 변 전체에
 *  긋는다(변 양끝을 0.12pt 넘김) — 법령 별표 273건 클립 격자 칸 변 83,056개 가운데 선이 절반 넘게 덮은 변은 덮이지 않은 길이가 0.3pt
 *  안 56,668개·1.5pt 안 1,114개(점선 끝 틈)이고 1.5~5.6pt 는 하나도 없다. 그보다 많이 빈 변은 옆 칸 테두리가 걸친 것이다 — 틀 칸 안
 *  좌우 5.6pt 빈 칸 사이에 든 산식 상자(물환경보전법 시행령 [별표 14의2])의 윗·밑줄이 그 위아래 온 폭 틀 칸 변의 97.6% 를 덮지만
 *  양끝 10.9pt 가 빈다. 그 선은 상자 칸 변으로만 센다(layout-frames 가 맞닿은 두 칸 변을 합쳐 선을 본다) */
const EDGE_COVER = 0.6
const EDGE_SLACK = 3
/** 이어 보는 선 조각 틈 (pt) — 점선·파선 테두리는 획 조각 사이가 떠 있다 */
const DASH_GAP = 3
/** 옆 칸 괘선 끝 (pt) — 한컴은 괘선을 칸 변 양끝에서 선 굵기 절반만큼 넘겨 긋는다(0.24pt 선 0.12pt). 한쪽 끝만 넘어 들어온 이보다 짧은
 *  조각은 옆 칸 선의 끝이다. 좁은 빈 칸(상자 사이 간격 열)은 양옆 상자 괘선 끝 두 조각이 DASH_GAP 안에 마주 보여 온 변이 덮인 것처럼
 *  읽혔다(지역사랑상품권 기본계획 보도자료 추진과제 표 — 간격 열·간격 행이 가로선 띠로 남아 세 표가 한 표로 붙음) */
const TIP_MAX = 1.5
/** 실선 끝 틈 상한 (pt) — 한 가닥 실선이 변 한끝을 이보다 많이 비우면 그 선은 이 변이 아니라 거기서 끝나는 옆 칸 변이다. 한컴은 보이는
 *  변을 칸 모서리까지 긋는다. 보도자료·rhwp 표 정답 세트에서 실선 끝 틈은 1.9pt 까지(겹선·굵은 선의 모서리 안쪽 들임) 이어지다 2.0~2.1 이
 *  비고, 2.2~2.8 은 짧은 옆 칸 변이 이 칸 변 일부에 걸친 것이다 — 「<참고>」 머리 상자(농작업 안전 수칙 보도자료)의 왼변이 위 빈 칸
 *  오른변의 61% 를 덮고 2.64pt 를 남겨 상자 둘레 틀이 표로 남았다. 점선은 무늬 끝 틈이라 EDGE_SLACK 으로만 본다 */
const SOLID_END_GAP = 2
/** 실선 한 가닥으로 보는 선 조각 이음 (pt) — 겹선·이어 그린 조각은 맞닿거나 겹친다 */
const SOLID_JOIN = 0.3

/** 한 방향 선 목록 — 자리(가로선 y·세로선 x) 오름차순, 변마다 EDGE_NEAR 안 선만 이분 탐색으로 본다 (칸·선이 많은 쪽에서 모든 쌍을 훑지 않게) */
interface Rules { dir: "h" | "v"; pos: number[]; lines: LineSegment[] }

function rules(lines: LineSegment[], dir: "h" | "v"): Rules {
  const sorted = [...lines].sort((a, b) => (dir === "h" ? a.y1 - b.y1 : a.x1 - b.x1))
  return { dir, pos: sorted.map(l => (dir === "h" ? l.y1 : l.x1)), lines: sorted }
}

/** 변(가로 y=at 의 x a1~a2, 세로 x=at 의 y a1~a2)이 보이는가 — 선이 덮은 길이로 판정 */
function seen(r: Rules, at: number, a1: number, a2: number, near = EDGE_NEAR): boolean {
  const len = a2 - a1
  if (len <= 0) return false
  const { covered, solid, endGap } = coverage(r, at, a1, a2, near)
  return covered >= len * EDGE_COVER && len - covered <= EDGE_SLACK && !(solid && endGap > SOLID_END_GAP)
}

/** 변을 선이 덮은 길이·실선 여부(조각 사이 틈 없음)·양끝 중 더 많이 빈 길이 — 점선 조각 사이 틈(DASH_GAP 안)은 이어 본다 */
function coverage(r: Rules, at: number, a1: number, a2: number, near: number): { covered: number; solid: boolean; endGap: number } {
  let i = 0, j = r.pos.length
  while (i < j) { const m = (i + j) >> 1; if (r.pos[m] < at - near) i = m + 1; else j = m }
  const spans: Array<[number, number]> = []
  for (; i < r.pos.length && r.pos[i] <= at + near; i++) {
    const l = r.lines[i]
    const l1 = r.dir === "h" ? Math.min(l.x1, l.x2) : Math.min(l.y1, l.y2), l2 = r.dir === "h" ? Math.max(l.x1, l.x2) : Math.max(l.y1, l.y2)
    const lo = Math.max(a1, l1), hi = Math.min(a2, l2)
    if (hi <= lo || ((l1 < a1) !== (l2 > a2) && hi - lo < TIP_MAX)) continue
    spans.push([lo, hi])
  }
  if (!spans.length) return { covered: 0, solid: false, endGap: a2 - a1 }
  spans.sort((p, q) => p[0] - q[0])
  let covered = 0, s = spans[0][0], e = spans[0][1], solid = true
  for (const [lo, hi] of spans.slice(1)) {
    if (lo > e + SOLID_JOIN) solid = false
    if (lo <= e + DASH_GAP) e = Math.max(e, hi)
    else { covered += e - s; s = lo; e = hi }
  }
  return { covered: covered + e - s, solid, endGap: Math.max(spans[0][0] - a1, a2 - e) }
}

/** 칸 사각형의 보이는 변 (PDF 좌표는 아래→위 — 윗변은 y2) */
function edgesOf(box: { x1: number; y1: number; x2: number; y2: number }, h: Rules, v: Rules, hNear = EDGE_NEAR): Edges {
  return {
    t: seen(h, box.y2, box.x1, box.x2, hNear),
    b: seen(h, box.y1, box.x1, box.x2, hNear),
    l: seen(v, box.x1, box.y1, box.y2),
    r: seen(v, box.x2, box.y1, box.y2),
  }
}

/** 칸 사각형의 보이는 변 — 선 목록을 그대로 받는 단건 판정 (시험·디버그용) */
export function cellEdges(box: { x1: number; y1: number; x2: number; y2: number }, horizontals: LineSegment[], verticals: LineSegment[]): Edges {
  return edgesOf(box, rules(horizontals, "h"), rules(verticals, "v"))
}

/** 부모 틀의 획이 자식 격자 바깥에 완전히 떨어져 있으면 자식 변으로 세지 않는다.
 * 셀 간격을 위한 EDGE_NEAR는 유지하고, 공유 경계·자식 변까지 닿는 굵은 획은 보존한다. */
function childRules(r: Rules, grid: TableGrid): Rules {
  const p = grid.clipParent
  if (!p) return r
  const horizontal = r.dir === "h", b = grid.bbox
  const lo = horizontal ? b.y1 : b.x1, hi = horizontal ? b.y2 : b.x2
  const parentLo = horizontal ? p.y1 : p.x1, parentHi = horizontal ? p.y2 : p.x2
  const lines = r.lines.filter(l => {
    // 채움 선분의 lineWidth는 마지막 stroke 상태이므로 실제 잉크 폭의 근거가 아니다.
    if (l.fromFill) return true
    const at = horizontal ? l.y1 : l.x1
    const ink = Math.abs(l.lineWidth) / 2 + 0.1
    return !((at < lo - ink && Math.abs(at - parentLo) <= ink)
      || (at > hi + ink && Math.abs(at - parentHi) <= ink))
  })
  return { dir: r.dir, pos: lines.map(l => horizontal ? l.y1 : l.x1), lines }
}

/**
 * 클립 격자(grid.cells 가 있는 격자 — clip-cells 산출물)의 칸마다 보이는 변을 기록한다. 선 격자(cells 없음)는 건너뛴다.
 * @param horizontals·verticals 추출 선 (합성 테두리를 더하기 전, 짧은 조각 포함)
 * @param nonRules 칸 테두리 선이 아닌 선 (흰 선·채움 영역 윤곽, line-extract)
 */
export function recordClipCellEdges(grids: TableGrid[], horizontals: LineSegment[], verticals: LineSegment[], nonRules?: ReadonlySet<LineSegment>): void {
  if (!grids.some(g => g.cells)) return
  const h = rules(nonRules?.size ? horizontals.filter(l => !nonRules.has(l)) : horizontals, "h")
  const v = rules(nonRules?.size ? verticals.filter(l => !nonRules.has(l)) : verticals, "v")
  // 얇은 채움 띠는 같은 획이 양변으로 잡히지 않게 탐색 창을 줄인다. 실제 두 획과 세로 변은 보존한다.
  for (const g of grids) {
    if (!g.cells) continue
    const ownH = childRules(h, g), ownV = childRules(v, g)
    for (const c of g.cells) {
      const near = c.filler ? Math.min(EDGE_NEAR, (c.bbox.y2 - c.bbox.y1) / 3) : EDGE_NEAR
      CLIP_CELL_EDGES.set(c, edgesOf(c.bbox, ownH, ownV, near))
    }
  }
}

/** 가상 밑변으로만 닫은 선 격자 중, 앞 행은 실제 네 변이 닫히고 마지막 행만 밑변이
 * 없는 경우에 한해 가시성을 기록한다. 내용·그림 보존과 빈 끝행 접기는 layout-frames가 맡는다.
 * 일반 선 격자나 열린 머리행의 동작은 바꾸지 않는다. */
export function recordOpenEndCellEdges(grid: TableGrid, cells: ExtractedCell[], horizontals: LineSegment[]): void {
  if (grid.cells || grid.rowYs.length < 4 || !cells.length) return
  const b = grid.bbox
  const end = horizontals.find(l => OPEN_END_RULES.has(l) && Math.abs(l.y1 - b.y1) <= EDGE_NEAR
    && Math.abs(l.x1 - b.x1) <= EDGE_NEAR && Math.abs(l.x2 - b.x2) <= EDGE_NEAR)
  const raw = end && OPEN_END_RULES.get(end)
  if (!raw) return
  const hs = raw.horizontals.filter(l => !raw.nonRules?.has(l))
  // 부분 밑변도 실제 획이다. 선이 셀 폭을 충분히 덮지 못해 b=false여도 빈행을 없애지 않는다.
  if (hs.some(l => Math.abs(l.y1 - b.y1) <= EDGE_NEAR && Math.min(l.x2, b.x2) - Math.max(l.x1, b.x1) > TIP_MAX)) return
  const h = rules(hs, "h"), v = rules(raw.verticals.filter(l => !raw.nonRules?.has(l)), "v")
  const edges = cells.map(c => edgesOf(c.bbox, h, v))
  const last = grid.rowYs.length - 2
  if (!cells.every((c, i) => {
    const e = edges[i]
    return e.t && e.l && e.r && (c.row + c.rowSpan === last + 1 ? c.row === last && !e.b : e.b)
  })) return
  cells.forEach((c, i) => CLIP_CELL_EDGES.set(c, edges[i]))
}

/** 추출 칸에 기록된 보이는 변을 그 칸으로 만든 IR 칸에 옮긴다 (곁정보가 없으면 그대로 둔다) */
export function takeClipCellEdges(from: ExtractedCell, to: IRCell): void {
  const e = CLIP_CELL_EDGES.get(from)
  if (e) CELL_EDGES.set(to, e)
}

/** 대응하는 두 셀 조각이 쪽 경계만 열려 있는가. 좌우 변과 바깥 위·아래 변이 모두 있어야
 * 무괘선 칸을 합치지 않는다. 행의 가로 분할이 다른 그림 표에서도 해당 셀만 이어질 수 있다. */
export function hasOpenCellSeam(a: IRCell, b: IRCell): boolean {
  const u = CELL_EDGES.get(a), d = CELL_EDGES.get(b)
  return !!u && !!d && u.t && !u.b && !d.t && d.b && u.l && u.r && d.l && d.r
}

/**
 * 쪽 경계로 갈린 한 칸의 두 조각을 이었을 때(위 조각 a 에 아래 조각 b 를 붙임) a 의 보이는 변 — 윗변은 위 조각, 밑변은 아래 조각에서
 * 가져오고 쪽 경계 쪽 변(a 밑변·b 윗변)은 버린다. 좌우는 어느 조각에서든 보이면 보인다. 한쪽이라도 곁정보가 없으면 그대로 둔다
 */
export function joinCellEdges(a: IRCell, b: IRCell): void {
  const u = CELL_EDGES.get(a), d = CELL_EDGES.get(b)
  if (!u || !d) return
  CELL_EDGES.set(a, { t: u.t, b: d.b, l: u.l || d.l, r: u.r || d.r })
}
