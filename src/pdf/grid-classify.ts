/** 선 격자와 셀 클립을 본문 상자·글줄과 구분하는 판정. */
import type { IRTable } from "../types.js"
import type { NormItem } from "./text-line.js"
import type { TableGrid, LineSegment } from "./line-types.js"

// ─── 프로즈 박스 감지 (라벨탭 위 전폭 프로즈) ──────────
/** 내부 수직 구분선 없는 전폭 행이 표 높이에서 차지해야 할 최소 비율 (기하 신호) */
const PROSEBOX_FULLWIDTH_MIN = 0.6
/** 긴 프로즈 셀 판정 글자수 */
const PROSEBOX_LONG_CELL_CHARS = 80
/** 프로즈 박스 판정 최소 긴 셀 수 */
const PROSEBOX_LONG_CELL_MIN = 3
/** 긴 셀이 채운 셀에서 차지해야 할 최소 비율 (텍스트 신호) */
const PROSEBOX_LONG_CELL_RATIO = 0.4
/** 열 경계 부근 수직선 매칭 tolerance (pt) */
const PROSEBOX_X_TOL = 8

/** 열 경계 x 부근 수직선들이 [yMin,yMax]를 덮는 union 길이 (프로즈 박스 판정용) */
function verticalCoverageAt(verticals: LineSegment[], x: number, yMin: number, yMax: number): number {
  const tol = PROSEBOX_X_TOL
  const spans: Array<[number, number]> = []
  for (const v of verticals) {
    if (Math.abs(v.x1 - x) > tol) continue
    const lo = Math.max(v.y1, yMin), hi = Math.min(v.y2, yMax)
    if (hi > lo) spans.push([lo, hi])
  }
  if (spans.length === 0) return 0
  spans.sort((a, b) => a[0] - b[0])
  let total = 0, s = spans[0][0], e = spans[0][1]
  for (let i = 1; i < spans.length; i++) {
    if (spans[i][0] <= e) { if (spans[i][1] > e) e = spans[i][1] }
    else { total += e - s; s = spans[i][0]; e = spans[i][1] }
  }
  return total + (e - s)
}

/** 글 조각마다 깐 클립은 칸이 아니다 — ezPDF Builder·MS Print To PDF 는 글 조각을 그 시작에서 다음 조각 시작까지 한 글줄 높이로 클립해,
 *  맞댄 클립들이 한 행 표가 됐다(고흥 2026 계획서 라벨 "배경 및 필요성" 이 "필요성" 문단 + "| 배경 | 및 |" 표로 찢긴 곳 749, hwpspec
 *  "DocHistory : | 스토리지" 187, 평가 보고서 표 머리 "’22 | 년"). 한 행 클립 격자의 칸마다 글이 칸 왼변에서 곧바로 시작하고(한컴 칸 클립은
 *  안 여백만큼 떨어진다) 행 높이가 글자 크기의 1.6배 이하일 때 */
export function isTextRunClipStrip(grid: TableGrid, items: NormItem[]): boolean {
  if (!grid.cells || grid.rowYs.length !== 2 || grid.cells.length < 2) return false
  const h = grid.rowYs[0] - grid.rowYs[1]
  return grid.cells.every(cell => {
    const b = cell.bbox
    const inside = items.filter(it => it.x + it.w / 2 > b.x1 && it.x + it.w / 2 < b.x2 && it.y + it.h / 2 > b.y1 && it.y + it.h / 2 < b.y2)
    return inside.length > 0 && Math.abs(Math.min(...inside.map(it => it.x)) - b.x1) <= 0.5 && h <= 1.6 * Math.max(...inside.map(it => it.fontSize))
  })
}

/**
 * 프로즈 박스 판정 — 상단 라벨탭(제목 칩)이 박스 테두리에 걸쳐 만든 가짜 열 위로
 * 본문이 전폭 프로즈로 흐르는 표(예: 검정고시 응시자격 박스). 셀 텍스트 조인(demote)은
 * 찢긴 조각을 그대로 이어 스크램블되므로, 이 표는 버리고 아이템을 프로즈 폴백(자연
 * 읽기순)으로 재추출한다. 판정은 두 신호의 교집합 —
 *   (a) 기하: 내부 수직 구분선 없는 전폭 행의 높이 합이 표 높이의 60%+
 *   (b) 텍스트: 80자+ 긴 셀이 3개+ 이고 채운 셀의 40%+
 * 기하만으론 다줄셀 정규표, 텍스트만으론 서술형 2열표(용어설명·Q&A)와 구분되지 않아
 * 둘 다 충족할 때만 발동한다.
 */
export function isProseBoxGrid(grid: TableGrid, verticals: LineSegment[], table: IRTable, items: NormItem[]): boolean {
  const numCols = grid.colXs.length - 1
  if (numCols < 2 || grid.rowYs.length < 3) return false

  const gyMax = grid.rowYs[0], gyMin = grid.rowYs[grid.rowYs.length - 1]
  const span = gyMax - gyMin
  if (span <= 0) return false
  const interior = grid.colXs.slice(1, -1)
  let fullWidthHeight = 0
  const divided: boolean[] = []
  for (let r = 0; r < grid.rowYs.length - 1; r++) {
    const top = grid.rowYs[r], bot = grid.rowYs[r + 1]
    const h = top - bot
    // 내부 열 경계 어느 하나라도 이 행의 절반 이상을 덮는 수직선이 있으면 구분된 행
    const hasDivider = h > 0 && interior.some(cx => verticalCoverageAt(verticals, cx, bot, top) >= h * 0.5)
    divided.push(hasDivider)
    if (h > 0 && !hasDivider) fullWidthHeight += h
  }
  if (fullWidthHeight < span * PROSEBOX_FULLWIDTH_MIN) return false
  if (isLabelTabBox(grid, divided, items, span)) return true

  const texts = table.cells.flat().map(c => c.text.trim()).filter(Boolean)
  const longCells = texts.filter(s => s.length > PROSEBOX_LONG_CELL_CHARS).length
  if (longCells < PROSEBOX_LONG_CELL_MIN || longCells < texts.length * PROSEBOX_LONG_CELL_RATIO) return false

  return true
}

/**
 * 라벨탭 상자 — 상자 윗변에 걸친 작은 제목 칩("목 차")의 세로변이 가짜 열 경계가 된 표. 칩 줄(구분된 위 행들) 아래가 통째로 전폭
 * 행(표 높이 80%+)이고 칩 줄 높이의 글이 칩 안 짧은 제목(12자 이하, 표 폭 60% 이하)뿐이면 칸 글 길이와 상관없이 프로즈 박스다 — 목차처럼
 * 짧은 줄만 든 상자는 긴 칸 신호를 못 받아 3×2 표로 짜이고 칸 순서가 뒤섞였다(벼·고추 재배면적조사 목차: "□ 통계표" 가 맨 앞 칸)
 */
function isLabelTabBox(grid: TableGrid, divided: boolean[], items: NormItem[], span: number): boolean {
  let k = divided.length
  while (k > 0 && !divided[k - 1]) k--
  if (k === 0 || k === divided.length) return false
  const bodyTop = grid.rowYs[k], b = grid.bbox
  if (bodyTop - grid.rowYs[grid.rowYs.length - 1] < 0.8 * span) return false
  const label = items.filter(it => {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2
    return cy > bodyTop && cy < b.y2 && cx > b.x1 && cx < b.x2 && it.text.trim()
  })
  if (!label.length) return false
  const x1 = Math.min(...label.map(it => it.x)), x2 = Math.max(...label.map(it => it.x + it.w))
  return label.reduce((n, it) => n + it.text.replace(/\s/g, "").length, 0) <= 12 && x2 - x1 <= 0.6 * (b.x2 - b.x1)
}

/**
 * OCR 쪽의 성긴 산문 격자 — 인포그래픽의 장식 선·말풍선 틀이 격자를 이뤄 칸 넷 중 셋 이상이 비고 글은 긴 문장 칸에
 * 몰린 것(ODL 141 "10 THINGS YOU SHOULD KNOW ABOUT COPYRIGHT"). 표가 아니라 본문이다. 텍스트층 서식(빈 기입칸 많은 신청서)과
 * 섞이지 않게 OCR 로 읽은 쪽에서만 본다
 */
export function isSparseProseGrid(table: IRTable): boolean {
  if (table.rows < 4) return false
  const texts = table.cells.flat().map(c => c.text.trim())
  const filled = texts.filter(Boolean)
  if (filled.length === 0 || filled.length > texts.length * 0.25) return false
  const chars = filled.reduce((n, t) => n + t.length, 0)
  const prose = filled.filter(t => t.length >= 60 && /[.!?。]/.test(t)).reduce((n, t) => n + t.length, 0)
  return prose >= chars * 0.6
}

