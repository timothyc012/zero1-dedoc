/**
 * 밑줄 감지 — baseline 바로 아래에 밀착한 얇은 수평선을 텍스트 아이템과 상관.
 *
 * PDF 에는 밑줄 폰트 플래그가 없다 — 밑줄은 별도 그래픽(선/얇은 사각형)으로
 * 그려지므로, 추출된 텍스트와 기하로 대조해 복원한다. 개정문 추가·변경 표시,
 * 제목 강조 보존용. 표 괘선 오탐 방어 4겹 — 수직선 접촉, 동일 스팬 반복,
 * 런 union 밀착(containment + coverage), 런 사이 컬럼급 구멍.
 *
 * firecrawl/pdf-inspector underline 휴리스틱 참조 (MIT)
 * https://github.com/firecrawl/pdf-inspector — src/extractor/underline.rs
 */

import type { LineSegment } from "./line-types.js"
import type { NormItem } from "./text-line.js"

/** 밑줄 최대 두께 (pt) — 굵은 선은 배경 채움/테두리 */
const UNDER_MAX_THICKNESS = 2.0
/** baseline 아래 허용 깊이 — CJK 밑줄은 전각 박스 하단(~0.67em)까지 내려간다 */
const UNDER_BELOW_EM = 0.72
/** baseline 아래 허용 깊이 최소값 (pt, 작은 폰트 라운딩) */
const UNDER_BELOW_MIN_PT = 3.0
/** baseline 위 허용 (pt, 라운딩) — 다음 줄 텍스트가 위 줄 밑줄에 매칭되는 것 차단 */
const UNDER_ABOVE_PT = 1.0
/** 선이 아이템을 덮어야 하는 최소 수평 비율 */
const UNDER_MIN_OVERLAP_RATIO = 0.6
/** 선이 매칭 런 union 을 벗어날 수 있는 좌우 여유 (em 배수 / 최소 pt) */
const UNDER_OWNER_PAD_EM = 0.75
const UNDER_OWNER_PAD_MIN_PT = 4.0
/** 매칭 텍스트 폭 합 / 선 폭 최소 비율 — 표 행 괘선은 셀 패딩·빈 열까지 걸쳐 미달 */
const UNDER_MIN_COVERAGE = 0.6
/** 수직선 접촉 판정 오차 (pt) — 접촉하면 표 그리드/폼 박스의 변 */
const UNDER_GRID_EPS = 2.0
/** 매칭 런 사이 구멍 한계 (em 배수) — 컬럼급 구멍이 있으면 표 행 괘선 */
const UNDER_COLUMN_GAP_EM = 2.0
/** 동일 x-스팬 수평선이 반복되는 y 레벨 수 — 이 이상이면 수평 괘선만의 표/폼 */
const UNDER_REPEATED_SPAN_LEVELS = 3
/** 동일 스팬 판정: 겹침 / 넓은 쪽 폭 최소 비율 */
const UNDER_SPAN_OVERLAP_RATIO = 0.8
/** 박스 상변 짝 탐색 창 (em 배수) — 배지/칩 높이는 대략 1~2줄 */
const UNDER_BOX_PAIR_MIN_EM = 0.5
const UNDER_BOX_PAIR_MAX_EM = 2.2
/** 상변 짝 스팬 유사성: 겹침 / 넓은 쪽 폭 (표 하변은 폭이 크게 달라 제외됨) */
const UNDER_BOX_PAIR_OVERLAP = 0.8

/**
 * baseline 바로 아래에 밀착한 얇은 수평선을 찾아 해당 아이템에 underline 마킹.
 */
export function markUnderlineItems(items: NormItem[], horizontals: LineSegment[], verticals: LineSegment[], nonRules?: ReadonlySet<LineSegment>): LineSegment[] {
  const underlines: LineSegment[] = []
  // Filled background outlines and white paint are geometry, not underline ink.
  if (nonRules?.size) horizontals = horizontals.filter(line => !nonRules.has(line))
  if (items.length === 0 || horizontals.length === 0) return underlines

  // Repeated text underlines can share a span with table rules. Require separate,
  // tightly owned lines before overriding the repetition guard. Cache ownership
  // because the same candidate can support several lines in the paragraph.
  const tightOwners = new Map<LineSegment, boolean>()
  const tightlyOwned = (line: LineSegment): boolean => {
    const cached = tightOwners.get(line)
    if (cached !== undefined) return cached
    const owners = items.filter(item => {
      const below = item.y - line.y1
      return item.w > 0 && item.text.trim() && below >= 0.5 && below <= 3
        && Math.min(line.x2, item.x + item.w) > Math.max(line.x1, item.x)
    }).sort((a, b) => a.x - b.x)
    let owned = owners.length > 0
      && (Math.abs(owners[0].x - line.x1) <= UNDER_GRID_EPS
        // A single PDF run can include an un-underlined note marker before the line.
        || (owners.length === 1 && line.x1 > owners[0].x
          && line.x1 - owners[0].x <= Math.max(owners[0].h, owners[0].fontSize, 1) * 3))
      && Math.abs(owners[owners.length - 1].x + owners[owners.length - 1].w - line.x2) <= UNDER_GRID_EPS
    for (let i = 1; owned && i < owners.length; i++) {
      const em = Math.max(owners[i].h, owners[i].fontSize, 1)
      if (owners[i].x - (owners[i - 1].x + owners[i - 1].w) > em * UNDER_COLUMN_GAP_EM) owned = false
    }
    tightOwners.set(line, owned)
    return owned
  }
  const paragraphUnderline = (line: LineSegment): boolean => {
    if (!tightlyOwned(line)) return false
    const width = line.x2 - line.x1
    const ys: number[] = []
    for (const other of horizontals) {
      const overlap = Math.min(line.x2, other.x2) - Math.max(line.x1, other.x1)
      if (other.lineWidth > UNDER_MAX_THICKNESS || overlap / Math.max(width, other.x2 - other.x1) < UNDER_SPAN_OVERLAP_RATIO || !tightlyOwned(other)) continue
      if (!ys.some(y => Math.abs(y - other.y1) < UNDER_GRID_EPS)) ys.push(other.y1)
      if (ys.length >= UNDER_REPEATED_SPAN_LEVELS) return true
    }
    return false
  }

  for (const line of horizontals) {
    if (line.lineWidth > UNDER_MAX_THICKNESS) continue
    const enclosed = insideTallCell(line, verticals, 0)
    const repeated = isRepeatedSpanRule(line, horizontals)
    const textSeries = repeated && paragraphUnderline(line)
    if (!enclosed && (touchesVertical(line, verticals) || (repeated && !textSeries))) continue

    const matches: NormItem[] = []
    for (const item of items) {
      const h = item.h > 0 ? item.h : item.fontSize
      if (h <= 0 || item.w <= 0 || !item.text.trim()) continue
      const below = Math.max(h * UNDER_BELOW_EM, UNDER_BELOW_MIN_PT)
      if (line.y1 < item.y - below || line.y1 > item.y + UNDER_ABOVE_PT) continue
      const overlap = Math.min(line.x2, item.x + item.w) - Math.max(line.x1, item.x)
      if (overlap / item.w < UNDER_MIN_OVERLAP_RATIO) continue
      matches.push(item)
    }
    if (matches.length === 0) continue

    // 밀착 소유 검증: 선이 매칭 런 union 에 밀착해야 밑줄
    let x1 = Infinity, x2 = -Infinity, maxH = 0, covered = 0
    for (const m of matches) {
      x1 = Math.min(x1, m.x)
      x2 = Math.max(x2, m.x + m.w)
      maxH = Math.max(maxH, m.h > 0 ? m.h : m.fontSize)
      covered += m.w
    }
    // 긴 셀의 패딩 안쪽에 끝나는 반복 밑줄은 행 경계가 아니다. 실제 괘선은 셀 변에 닿는다.
    const inset = enclosed && insideTallCell(line, verticals, maxH)
    if (enclosed && !inset && (touchesVertical(line, verticals) || (repeated && !textSeries))) continue
    const pad = Math.max(maxH * UNDER_OWNER_PAD_EM, UNDER_OWNER_PAD_MIN_PT)
    if (line.x1 < x1 - pad || line.x2 > x2 + pad) continue
    if (covered < (line.x2 - line.x1) * UNDER_MIN_COVERAGE) continue

    // 위쪽에 같은 스팬의 수평선이 마주보면 배지/칩/제목박스의 하변 — 밑줄은 위짝이 없다.
    // 라운드 모서리 배지는 상하변이 직선으로만 나와 수직선 접촉 방어를 비껴가므로 필수.
    if (hasBoxTopPair(line, maxH, horizontals, inset || textSeries || tightlyOwned(line) ? items : undefined)) continue

    // 매칭 런 사이 컬럼급 구멍 → 표 행 괘선 (밑줄 줄은 단어 간격 수준으로 연속)
    matches.sort((a, b) => a.x - b.x)
    let hole = false
    for (let i = 1; i < matches.length; i++) {
      if (matches[i].x - (matches[i - 1].x + matches[i - 1].w) > maxH * UNDER_COLUMN_GAP_EM) {
        hole = true
        break
      }
    }
    if (hole) continue

    for (const m of matches) m.underline = true
    underlines.push(line)
  }
  return underlines
}

/** 여러 줄 높이의 두 셀 변 사이에 양끝이 엄격히 들어간 선. 중간 열 경계를 가로지르면 제외한다. */
function insideTallCell(line: LineSegment, verticals: LineSegment[], em: number): boolean {
  let left = false, right = false
  for (const v of verticals) {
    const lo = Math.min(v.y1, v.y2), hi = Math.max(v.y1, v.y2)
    if (lo > line.y1 || hi < line.y1) continue
    if (v.x1 >= line.x1 - 0.5 && v.x1 <= line.x2 + 0.5) return false
    if (hi - lo <= em * UNDER_BOX_PAIR_MAX_EM) continue
    if (v.x1 < line.x1 - 0.5) left = true
    if (v.x1 > line.x2 + 0.5) right = true
  }
  return left && right
}

/** 선의 x-스팬 내에서 선 y 를 지나는(접촉 포함) 수직선 존재 여부 — 표 그리드/폼 박스 판정 */
function touchesVertical(line: LineSegment, verticals: LineSegment[]): boolean {
  for (const v of verticals) {
    if (v.x1 < line.x1 - UNDER_GRID_EPS || v.x1 > line.x2 + UNDER_GRID_EPS) continue
    const lo = Math.min(v.y1, v.y2), hi = Math.max(v.y1, v.y2)
    if (hi - lo <= UNDER_GRID_EPS) continue
    if (lo <= line.y1 + UNDER_GRID_EPS && hi >= line.y1 - UNDER_GRID_EPS) return true
  }
  return false
}

/** 후보선 위쪽 0.5~2.2em 에 거의 같은 스팬의 수평선 존재 — 박스/배지의 상변 짝 */
function hasBoxTopPair(line: LineSegment, maxH: number, horizontals: LineSegment[], cellItems?: NormItem[]): boolean {
  const w = line.x2 - line.x1
  if (w <= 0) return false
  for (const o of horizontals) {
    if (o === line) continue
    const dy = o.y1 - line.y1
    if (dy < maxH * UNDER_BOX_PAIR_MIN_EM || dy > maxH * UNDER_BOX_PAIR_MAX_EM) continue
    const ow = o.x2 - o.x1
    if (ow <= 0) continue
    const overlap = Math.min(line.x2, o.x2) - Math.max(line.x1, o.x1)
    if (overlap / Math.max(w, ow) < UNDER_BOX_PAIR_OVERLAP) continue
    // 긴 셀의 위짝도 바로 위 본문에 밀착한 밑줄이면 박스 상변이 아니다. 텍스트 없는 배지 상변은 지킨다.
    const covered = cellItems?.reduce((sum, item) => {
      const below = item.y - o.y1
      if (below < 0.5 || below > 3 || !item.text.trim()) return sum
      return sum + Math.max(0, Math.min(o.x2, item.x + item.w) - Math.max(o.x1, item.x))
    }, 0) ?? 0
    if (covered < ow * UNDER_MIN_COVERAGE) return true
  }
  return false
}

/** 거의 같은 x-스팬의 수평선이 3+ y 레벨에서 반복 — 수평 괘선만 쓰는 표/폼 (서식류) */
function isRepeatedSpanRule(line: LineSegment, horizontals: LineSegment[]): boolean {
  const w = line.x2 - line.x1
  if (w <= 0) return false
  const ys: number[] = []
  for (const o of horizontals) {
    const ow = o.x2 - o.x1
    if (ow <= 0) continue
    const overlap = Math.min(line.x2, o.x2) - Math.max(line.x1, o.x1)
    if (overlap / Math.max(w, ow) < UNDER_SPAN_OVERLAP_RATIO) continue
    if (!ys.some(y => Math.abs(y - o.y1) < 2)) ys.push(o.y1)
  }
  return ys.length >= UNDER_REPEATED_SPAN_LEVELS
}

/**
 * underline 마킹된 아이템 run 을 <u>...</u> 로 감싼다 (GFM 은 밑줄 문법이 없어 인라인 HTML).
 * 같은 시각적 줄이라도 1em 넘게 떨어진 구간은 별도 run — 사이의 비밑줄 텍스트 오염 방지.
 * OCR 글은 평문이다(첨자와 같은 규약) — 래스터 괘선이 로고·표 칸 글 밑에 닿아 "<u>FamilyMart</u>"·"<u>기획</u> 조정실" 이 됐다.
 * 선은 종전대로 밑줄로 빼(표 행 경계가 아니다) 표 구조는 그대로
 */
export function wrapUnderlineRuns(items: NormItem[]): void {
  const marked = items.filter(i => i.underline && i.fontName !== "ocr")
  if (marked.length === 0) return

  const lines = new Map<number, NormItem[]>()
  for (const item of marked) {
    const key = Math.round(item.y / 3)
    const arr = lines.get(key) || []
    arr.push(item)
    lines.set(key, arr)
  }
  for (const arr of lines.values()) {
    arr.sort((a, b) => a.x - b.x)
    let runStart = 0
    for (let i = 1; i <= arr.length; i++) {
      const prev = arr[i - 1]
      const em = Math.max(prev.h > 0 ? prev.h : prev.fontSize, 1)
      const gap = i < arr.length ? arr[i].x - (prev.x + prev.w) : Infinity
      if (gap > em) {
        arr[runStart].text = "<u>" + arr[runStart].text
        prev.text = prev.text + "</u>"
        runStart = i
      }
    }
  }
}
