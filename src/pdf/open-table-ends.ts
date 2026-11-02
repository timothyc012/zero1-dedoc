/**
 * 열린 위·아래 변 표 닫기 (line-detector.ts 계열 전처리, closeOpenTableEdges 의 짝).
 *
 * 서구 보고서 표는 머리행 위 테두리와 합계행 아래 테두리를 긋지 않고, 열 구분 수직선만
 * 그 행까지 내려 긋는 스타일이 있다(ODL 047: 수평선이 데이터 행만 감싸고 머리 두 줄과
 * `Total` 행은 격자 밖). 격자가 데이터 행에서 끝나면 머리행과 합계행이 따로 가짜 표가 된다.
 *
 * 같은 끝점에 이른 수직선이 그 증거다. 끝점 정렬 괘선 묶음(표 몸통)의 맨 위·아래 괘선을
 * 지나 같은 y 까지 뻗은 내부 수직선이 둘 이상이면, 그 y 에 몸통 폭의 가상 괘선을 합성한다.
 * 선이 증거이므로 글 배치로 행을 흡수하지 않는다. 클립 격자는 이 경로를 거치지 않는다(clip-cells).
 */

import type { LineSegment } from "./line-types.js"
import { chainCollinearRules } from "./line-extract.js"
import { OPEN_END_RULES, type RawCellRules } from "./cell-edges.js"

/** 끝점 정렬 괘선 묶음 허용 오차 (pt) — closeOpenTableEdges EDGE_ALIGN_TOL 과 같다 */
const ALIGN_TOL = 3
/** 몸통 최소 괘선 수 (2행 이상) */
const MIN_RULES = 3
/** 같은 논리 수직선으로 잇는 끊김 허용 (pt) — 셀마다 끊어 그은 세로 획 */
const V_CHAIN_GAP = 1.5
/** 같은 열 x 판정 (pt) */
const V_X_TOL = 1.5
/** 괘선에 닿음 판정 (pt) */
const TOUCH_TOL = 2
/** 몸통 밖으로 뻗은 최소 길이 (pt) — 괘선 교차 삐침 배제, 한 글줄 이상 */
const MIN_REACH = 8
/** 같은 끝점 판정 (pt) */
const END_TOL = 1.5
/** 같은 끝점에 이른 최소 내부 수직선 수 */
const MIN_REACHING = 2
/** 내부 수직선: 몸통 좌우 변에서 이만큼 안쪽 (table-grid MIN_COL_WIDTH) */
const INSET = 15

/** 같은 x 에서 끊어 그은 수직 획을 논리 수직선으로 잇는다 (입력 불변) */
function chainVerticals(verticals: LineSegment[]): LineSegment[] {
  const sorted = [...verticals].sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1)
  const out: LineSegment[] = []
  for (const v of sorted) {
    const prev = [...out].reverse().find(o => Math.abs(o.x1 - v.x1) <= V_X_TOL && v.y1 - o.y2 <= V_CHAIN_GAP && v.y2 >= o.y1)
    if (prev) { if (v.y2 > prev.y2) prev.y2 = v.y2; if (v.y1 < prev.y1) prev.y1 = v.y1 }
    else out.push({ ...v })
  }
  return out
}

/** 몸통 밖 끝점들 가운데 내부 수직선이 가장 많이 모인 끝점 (MIN_REACHING 미만이면 null) */
function commonEnd(ends: number[]): number | null {
  let best: number | null = null, bestN = 0
  for (const e of ends) {
    const n = ends.filter(o => Math.abs(o - e) <= END_TOL).length
    if (n > bestN || (n === bestN && best !== null && Math.abs(e) > Math.abs(best))) { best = e; bestN = n }
  }
  return bestN >= MIN_REACHING ? best : null
}

/**
 * 양끝이 같은 괘선 묶음을 세로선으로 이어진 몸통마다 가른다. 같은 폭으로 위아래 떨어져 놓인 표들(서식 칸 안 "기관명 | 개설일 …"
 * 표 넷, 개인정보 분석 별지)이 한 묶음이면 맨 아래 표의 열린 아래 변만 보고 나머지는 못 닫았다. 이웃 괘선 사이를 잇는 세로선이
 * 없으면 다른 몸통이다. 몸통(괘선 MIN_RULES 개 이상) 조각이 둘 이상일 때만 가른다 — 아니면 종전대로 한 묶음
 */
function splitBodies(g: LineSegment[], chained: LineSegment[]): LineSegment[][] {
  if (g.length < MIN_RULES * 2) return [g]
  const x1 = Math.min(...g.map(r => r.x1)), x2 = Math.max(...g.map(r => r.x2))
  const sorted = [...g].sort((a, b) => b.y1 - a.y1)
  const parts: LineSegment[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const upper = sorted[i - 1].y1, lower = sorted[i].y1
    const joined = chained.some(v => v.x1 >= x1 - ALIGN_TOL && v.x1 <= x2 + ALIGN_TOL && v.y2 >= upper - TOUCH_TOL && v.y1 <= lower + TOUCH_TOL)
    if (joined) parts[parts.length - 1].push(sorted[i])
    else parts.push([sorted[i]])
  }
  return parts.filter(p => p.length >= MIN_RULES).length >= 2 ? parts : [g]
}

/**
 * 몸통 괘선 묶음의 위·아래로 같은 끝점까지 뻗은 내부 수직선이 둘 이상이면 그 끝점에 가상 수평 괘선을 더한다.
 * 조건 미달이면 입력을 그대로 반환한다.
 * @param textLayer 쪽 글이 모두 텍스트층(seq)일 때만 끝점이 제각각인 아래 변을 닫는다 — OCR 래스터 괘선은 끝점이 흔들린다
 */
export function closeOpenTableEnds(horizontals: LineSegment[], verticals: LineSegment[], textLayer = false, raw?: RawCellRules): LineSegment[] {
  if (horizontals.length < MIN_RULES || verticals.length < MIN_REACHING) return horizontals
  const groups: LineSegment[][] = []
  for (const rule of chainCollinearRules(horizontals)) {
    const g = groups.find(gr => Math.abs(gr[0].x1 - rule.x1) <= ALIGN_TOL && Math.abs(gr[0].x2 - rule.x2) <= ALIGN_TOL)
    if (g) g.push(rule)
    else groups.push([rule])
  }
  const chained = chainVerticals(verticals)
  const added: LineSegment[] = []
  for (const g of groups.flatMap(gr => splitBodies(gr, chained))) {
    if (g.length < MIN_RULES) continue
    const x1 = Math.min(...g.map(r => r.x1)), x2 = Math.max(...g.map(r => r.x2))
    const yLo = Math.min(...g.map(r => r.y1)), yHi = Math.max(...g.map(r => r.y1))
    const interior = chained.filter(v => v.x1 > x1 + INSET && v.x1 < x2 - INSET && v.y1 <= yHi + TOUCH_TOL && v.y2 >= yLo - TOUCH_TOL)
    // 위: 맨 위 괘선에 닿아 위로 뻗은 수직선의 윗끝 / 아래: 맨 아래 괘선에 닿아 아래로 뻗은 수직선의 아랫끝
    const top = commonEnd(interior.filter(v => v.y1 <= yHi + TOUCH_TOL && v.y2 >= yHi + MIN_REACH).map(v => v.y2))
    const below = interior.filter(v => v.y2 >= yLo - TOUCH_TOL && v.y1 <= yLo - MIN_REACH)
    let bottom = commonEnd(below.map(v => v.y1))
    // 끝점이 제각각이어도 맨 아래 괘선에 닿은 내부 수직선이 모두(둘 이상) 아래로 뻗었으면 마지막 행은 아래 변만 열린 것 —
    // 모든 열 구분선이 아직 감싸는 가장 얕은 끝점에서 닫는다. ODL 182 슬라이드 표는 마지막 "Highlight" 행 아래 괘선 없이
    // 굵은 세로선(47pt 끝)과 옅은 구분선 둘(31·28pt 끝)만 내려 그어 그 행이 표 밖으로 떨어졌다
    if (bottom === null && textLayer && below.length >= MIN_REACHING &&
      below.length === interior.filter(v => v.y2 >= yLo - TOUCH_TOL && v.y1 <= yLo + TOUCH_TOL).length) bottom = Math.max(...below.map(v => v.y1))
    for (const y of [top, bottom]) {
      if (y === null) continue
      // 그 높이에 이미 몸통 폭을 덮는 괘선이 있으면 닫힌 변이다
      if (horizontals.some(h => Math.abs(h.y1 - y) <= TOUCH_TOL && h.x1 <= x1 + INSET && h.x2 >= x2 - INSET)) continue
      const rule = { x1, y1: y, x2, y2: y, lineWidth: 0.5 }
      if (raw) OPEN_END_RULES.set(rule, raw)
      added.push(rule)
    }
  }
  return added.length ? [...horizontals, ...added] : horizontals
}
