/**
 * 세출예산 사업명세서의 무괘선 하위 행 (line-detector.ts 계열 전처리, header-box-rows 와 같은 자리).
 *
 * 사업명세서는 편성목("201 일반운영비")·통계목("01 사무관리비")·산출 내역("○공인노무사 자문수당 400,000원 * 12월")을
 * 저마다 한 행으로 두고 금액 열을 그 줄에 맞춰 적는데, 행 사이 괘선을 긋지 않는 서식이 많다. 클립 격자(한컴 PDF)는
 * 칸 클립이 행을 가르지만 래스터 괘선(OCR)·선만 있는 PDF 는 괘선 사이 행 하나에 "01 사무관리비⏎○…" 와 금액
 * "4,800⏎4,800" 이 뭉쳐 칸 차례가 섞였다(속초·부천 예산서 OCR — 같은 PDF 텍스트층 표는 행마다 갈린다).
 *
 * 격자 행 하나의 한 열에서 둘째 줄 이후에 목 코드 줄(두세 자리 수 + 한글)이 있거나 목 코드 줄 다음 첫 "○" 줄이 있으면 그
 * 줄 위가 행 경계다 — 이어지는 "○" 줄·"―" 내역·꺾인 줄은 같은 행이다(정답 칸에 함께 든다). 다른 열에도 경계 아래에 글이
 * 있고(금액) 경계를 걸친 글이 없을 때만, 그 열 왼쪽 끝부터 격자 오른쪽 끝까지 가상 괘선을 더한다 — 왼쪽 열은 병합 칸으로 남는다.
 */

import type { LineSegment } from "./line-types.js"
import { buildTableGrids } from "./table-grid.js"
import { type NormItem, groupByY } from "./text-line.js"

/** 목 코드 줄 ("201 일반운영비", OCR 은 띄어쓰기를 잃는다 "01사무관리비") */
const CODE = /^\d{2,3}\s*[가-힣]/
/** 산출 내역 줄 — OCR 은 기울인 쪽에서 "○" 를 홑자모 "ㅇ" 으로 읽는다(줄 첫머리 "ㅇ" 은 낱말이 아니다, 고흥 예산서 1° 기울임) */
const BULLET = /^[○ㅇ]/
/** 목 이름이 꺾인 나머지 줄 최대 글자 수 */
const WRAP_REST_MAX = 6
/** 칸 경계 넘침 허용 (pt) */
const EDGE_TOL = 2
/** 최소 열 수 — 과목 열 + 금액 열 둘 이상 */
const MIN_COLS = 3

export function splitBudgetSubRows(
  horizontals: LineSegment[],
  verticals: LineSegment[],
  items: NormItem[],
): LineSegment[] {
  if (!items.some(it => BULLET.test(it.text.trim()))) return horizontals
  const add: LineSegment[] = []
  for (const g of buildTableGrids(horizontals, verticals)) {
    if (g.colXs.length - 1 < MIN_COLS) continue
    for (let r = 0; r + 1 < g.rowYs.length; r++) {
      const top = g.rowYs[r], bottom = g.rowYs[r + 1]
      const row = items.filter(it => { const cy = it.y + it.h / 2; return cy < top && cy > bottom && it.x >= g.bbox.x1 - EDGE_TOL && it.x + it.w <= g.bbox.x2 + EDGE_TOL })
      if (row.length < 3) continue
      for (let c = 0; c + 1 < g.colXs.length; c++) {
        const col = row.filter(it => it.x >= g.colXs[c] - EDGE_TOL && it.x + it.w <= g.colXs[c + 1] + EDGE_TOL)
        const lines = groupByY([...col].sort((a, b) => b.y - a.y || a.x - b.x)).map(l => l.sort((a, b) => a.x - b.x))
        if (lines.length < 2) continue
        const head = (l: NormItem[]) => l.map(it => it.text).join("").trim()
        const cuts: number[] = []
        let afterCode = CODE.test(head(lines[0]))
        const right = row.filter(it => it.x >= g.colXs[c + 1] - EDGE_TOL)
        for (let i = 1; i < lines.length; i++) {
          const t = head(lines[i])
          const code = CODE.test(t)
          // 목 코드 줄 바로 다음 줄은 산출 내역이다 — 글머리 "○" 를 OCR 이 놓쳐도("공공요금 및 제세", 고흥 예산서 잡음 쪽) 그 줄 높이에
          // 금액이 맞춰져 있으면 내역 첫 줄로 본다(꺾인 목 이름 둘째 줄엔 금액이 없다)
          const prevCode = CODE.test(head(lines[i - 1]))
          const bullet = BULLET.test(t) || (prevCode && !code && right.some(it => Math.abs(it.y - lines[i][0].y) <= 3))
          if (code || (bullet && afterCode)) {
            const above = Math.min(...lines[i - 1].map(it => it.y)), below = Math.max(...lines[i].map(it => it.y + it.h))
            if (above > below) cuts.push((above + below) / 2)
          }
          // 글머리도 금액도 못 찾은 긴 줄은 이미 시작된 내역이다(금액이 꺾인 둘째 줄에 맞춰진 "사회적경제육성위원회 등 회의참석수당⏎
          // 1,000,000원", 부천 예산서 JPEG 쪽) — 뒤 "○" 줄에서 가르지 않는다. 목 이름이 꺾인 짧은 나머지("취득비")만 넘긴다
          if (code) afterCode = true
          else if (bullet || [...t.replace(/\s/g, "")].length > WRAP_REST_MAX) afterCode = false
        }
        if (!cuts.length) continue
        for (const y of cuts) {
          // 경계 아래 행에도 금액이 있고, 어느 열의 글도 경계를 걸치지 않아야 한다
          if (!right.some(it => it.y + it.h < y) || row.some(it => it.y < y && it.y + it.h > y)) continue
          add.push({ x1: g.colXs[c], y1: y, x2: g.bbox.x2, y2: y, lineWidth: 0.5 })
        }
        break
      }
    }
  }
  return add.length ? [...horizontals, ...add] : horizontals
}
